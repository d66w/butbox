import assert from "node:assert/strict";
import test from "node:test";

class FakeLocalStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

const storage = new FakeLocalStorage();
globalThis.window = { localStorage: storage };

const FUTURE = Math.floor(Date.now() / 1000) + 86400;
storage.setItem(
  "butbox.session",
  JSON.stringify({ accessToken: "token-1", refreshToken: "refresh-1", expiresAt: FUTURE })
);

const calls = [];
let responder = () => json(200, []);

function json(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => (body === null ? "" : JSON.stringify(body))
  };
}

globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  return responder(String(url), options);
};

const api = await import("../src/api.js");
const { CONFIG } = await import("../config.js");
const { AppError, errorMessage } = await import("../src/errors.js");

function reset(next) {
  calls.length = 0;
  responder = next ?? (() => json(200, []));
}

test("every request carries the anon apikey and the bearer token", async () => {
  reset(() => json(200, [{ id: "1" }]));
  await api.fetchPlans();
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.ok(url.startsWith(`${CONFIG.supabaseUrl}/rest/v1/plans`), url);
  assert.equal(options.headers.apikey, CONFIG.supabaseAnonKey);
  assert.equal(options.headers.Authorization, "Bearer token-1");
});

test("the service_role key never appears in an outgoing request", async () => {
  reset(() => json(200, []));
  await api.fetchSpaces();
  const serialised = JSON.stringify(calls[0]);
  assert.ok(!/service_role/i.test(serialised));
  assert.ok(!/"role"\s*:\s*"service_role"/.test(serialised));
});

test("ids are url-encoded so a crafted id cannot rewrite the query", async () => {
  reset(() => json(200, []));
  await api.fetchBoxText("abc&select=*&x=1");
  const url = calls[0].url;
  assert.ok(url.includes("id=eq.abc%26select%3D*%26x%3D1"), url);
  assert.ok(!url.includes("id=eq.abc&select=*"), url);
});

test("rpc calls post their arguments as a json body", async () => {
  reset(() => json(200, "space-1"));
  const result = await api.createSpace("고객센터");
  assert.equal(result, "space-1");
  assert.equal(calls[0].url, `${CONFIG.supabaseUrl}/rest/v1/rpc/create_space`);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_name: "고객센터" });
});

test("saving box text patches only that row and asks for the saved row back", async () => {
  reset(() => json(200, [{ id: "box-1", text_content: "안녕하세요" }]));
  await api.saveBoxText("box-1", "안녕하세요");
  assert.equal(calls[0].options.method, "PATCH");
  assert.ok(calls[0].url.endsWith("/rest/v1/boxes?id=eq.box-1"), calls[0].url);
  assert.equal(calls[0].options.headers.Prefer, "return=representation");
  assert.deepEqual(JSON.parse(calls[0].options.body), { text_content: "안녕하세요" });
});

test("a 204 response becomes null instead of a parse error", async () => {
  reset(() => json(204, null));
  assert.equal(await api.deleteBox("box-1"), null);
});

test("a database exception keeps its raw code and still reads as Korean", async () => {
  reset(() => json(400, { message: "BOX_LIMIT_REACHED" }));
  await assert.rejects(
    () => api.createBox("space-1", "새 박스"),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.message, "BOX_LIMIT_REACHED");
      assert.match(errorMessage(error), /한도/);
      return true;
    }
  );
});

test("a postgres constraint message is not shown to the user verbatim", async () => {
  reset(() => json(400, { message: 'new row violates check constraint "boxes_text_size"' }));
  await assert.rejects(
    () => api.saveBoxText("box-1", "x"),
    (error) => {
      assert.ok(!errorMessage(error).includes("boxes_text_size"));
      assert.match(errorMessage(error), /[가-힣]/);
      return true;
    }
  );
});

test("a dropped connection surfaces as a network error, not a raw fetch failure", async () => {
  reset(() => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(
    () => api.fetchPlans(),
    (error) => {
      assert.equal(error.code, "NETWORK");
      assert.match(errorMessage(error), /네트워크/);
      return true;
    }
  );
});

test("a 401 refreshes the token once and retries the same request", async () => {
  let restCalls = 0;
  reset((url) => {
    if (url.includes("/auth/v1/token")) {
      return json(200, {
        access_token: "token-2",
        refresh_token: "refresh-2",
        expires_in: 3600
      });
    }
    restCalls += 1;
    return restCalls === 1 ? json(401, { message: "JWT expired" }) : json(200, [{ id: "box-1" }]);
  });

  const rows = await api.fetchBoxes("space-1");
  assert.deepEqual(rows, [{ id: "box-1" }]);
  assert.equal(restCalls, 2);
  const refresh = calls.find((call) => call.url.includes("grant_type=refresh_token"));
  assert.ok(refresh, "토큰 갱신 요청이 없습니다.");
  assert.deepEqual(JSON.parse(refresh.options.body), { refresh_token: "refresh-1" });
  assert.equal(calls.at(-1).options.headers.Authorization, "Bearer token-2");
});

test("a refresh that also fails clears the session instead of looping", async () => {
  reset((url) => {
    if (url.includes("/auth/v1/token")) {
      return json(400, { error_description: "invalid refresh token" });
    }
    return json(401, { message: "JWT expired" });
  });

  await assert.rejects(() => api.fetchSpaces());
  assert.equal(storage.getItem("butbox.session"), null);
});
