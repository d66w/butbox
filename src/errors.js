const MESSAGES = {
  NOT_AUTHENTICATED: "로그인이 필요합니다. 다시 로그인해 주세요.",
  NOT_SPACE_MEMBER: "이 스페이스의 멤버가 아닙니다.",
  NOT_SPACE_OWNER: "스페이스를 만든 사람만 할 수 있습니다.",
  OWNER_CANNOT_LEAVE: "만든 사람은 나갈 수 없습니다. 스페이스를 삭제하거나 그대로 두세요.",
  SPACE_NOT_FOUND: "그 코드를 가진 스페이스가 없습니다.",
  SPACE_CODE_TAKEN: "이미 쓰이고 있는 코드입니다.",
  SPACE_CODE_EXHAUSTED: "코드를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  INVALID_SPACE_CODE: "코드는 영문 대문자, 숫자, 하이픈으로 4자 이상이어야 합니다.",
  INVALID_SPACE_NAME: "스페이스 이름을 1자 이상 40자 이하로 입력하세요.",
  INVALID_BOX_NAME: "박스 이름을 1자 이상 40자 이하로 입력하세요.",
  JOIN_DISABLED: "이 스페이스는 지금 참여를 받지 않습니다. 만든 사람에게 문의하세요.",
  WRONG_PASSWORD: "비밀번호가 맞지 않습니다.",
  PASSWORD_TOO_SHORT: "비밀번호는 6자 이상이어야 합니다.",
  SPACE_LIMIT_REACHED: "무료 플랜에서는 스페이스를 1개까지 만들 수 있습니다.",
  BOX_LIMIT_REACHED: "이 스페이스의 박스 개수가 한도에 찼습니다.",
  BOX_LOCKED: "읽기 전용 박스입니다. 복사는 되지만 덮어쓸 수 없습니다.",
  SPACE_QUOTA_EXCEEDED: "스페이스 용량이 가득 찼습니다.",
  SESSION_EXPIRED: "로그인이 만료됐습니다. 다시 로그인해 주세요.",
  AUTH_REDIRECT_MISCONFIGURED: "Supabase에 이 확장의 로그인 콜백 주소를 등록해야 합니다.",
  NETWORK: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
  CLIPBOARD: "클립보드에 쓰지 못했습니다. 패널을 한 번 클릭한 뒤 다시 눌러 주세요.",
  NOT_SPACE_ADMIN: "스페이스를 관리할 수 있는 사람만 할 수 있습니다.",
  INVITE_NOT_FOUND: "초대를 찾을 수 없습니다. 링크를 다시 확인해 주세요.",
  INVITE_EXPIRED: "이 초대 링크는 만료됐습니다. 새 링크를 요청하세요.",
  INVITE_EXHAUSTED: "이 초대 링크는 사용 횟수를 다 썼습니다. 새 링크를 요청하세요.",
  INVITE_TOKEN_EXHAUSTED: "초대 링크를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  CANNOT_CHANGE_OWN_ROLE: "자기 권한은 바꿀 수 없습니다.",
  CANNOT_CHANGE_OWNER_ROLE: "만든 사람의 권한은 바꿀 수 없습니다.",
  INVALID_ROLE: "쓸 수 없는 권한입니다.",
  INVALID_SPACE_DESCRIPTION: "스페이스 설명은 120자까지 쓸 수 있습니다.",
  SPACE_NOT_CONFIGURED: "웹 주소가 아직 설정되지 않아 초대 링크를 만들 수 없습니다.",
  REQUEST_FAILED: "요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요."
};

const HANGUL = /[가-힣]/;

function translate(raw) {
  const text = String(raw ?? "");
  for (const [code, message] of Object.entries(MESSAGES)) {
    if (text.includes(code)) {
      return message;
    }
  }
  if (text.includes("Failed to fetch") || text.includes("NetworkError")) {
    return MESSAGES.NETWORK;
  }
  if (/clipboard|not focused|NotAllowedError/i.test(text)) {
    return MESSAGES.CLIPBOARD;
  }
  if (text.length === 0 || !HANGUL.test(text)) {
    return MESSAGES.REQUEST_FAILED;
  }
  return text;
}

export class AppError extends Error {
  constructor(code, message, cause) {
    super(message ?? MESSAGES[code] ?? code);
    this.name = "AppError";
    this.code = code;
    this.cause = cause;
  }
}

export function errorMessage(error) {
  if (!error) {
    return "알 수 없는 오류가 생겼습니다.";
  }
  return translate(error.message ?? error);
}

export function isAuthError(error) {
  if (!error) {
    return false;
  }
  const code = error instanceof AppError ? error.code : "";
  if (code === "SESSION_EXPIRED" || code === "NOT_AUTHENTICATED") {
    return true;
  }
  return String(error.message ?? "").includes("SESSION_EXPIRED");
}
