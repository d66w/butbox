import { isConfigured, loadSession, signIn } from "../src/auth.js";
import { errorMessage } from "../src/errors.js";
import { showToast } from "../src/ui.js";

async function wireCtaButtons() {
  const buttons = document.querySelectorAll("[data-cta='signin']");

  if (!isConfigured()) {
    for (const button of buttons) {
      button.addEventListener("click", () => {
        window.location.href = "app.html";
      });
    }
    return;
  }

  const session = await loadSession();

  if (session) {
    for (const button of buttons) {
      button.textContent = "내 스페이스 열기";
      button.addEventListener("click", () => {
        window.location.href = "app.html";
      });
    }
    return;
  }

  for (const button of buttons) {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const original = button.textContent;
      button.textContent = "이동 중…";
      try {
        await signIn();
      } catch (error) {
        showToast(errorMessage(error), "error");
        button.disabled = false;
        button.textContent = original;
      }
    });
  }
}

wireCtaButtons().catch((error) => console.error("초기화 실패", error));
