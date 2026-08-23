import { completeWebSignIn } from "../../src/auth.js";
import { errorMessage } from "../../src/errors.js";

completeWebSignIn()
  .then(() => {
    window.location.replace("../app.html");
  })
  .catch((error) => {
    document.querySelector('[data-view="progress"]').hidden = true;
    document.querySelector('[data-view="failed"]').hidden = false;
    document.querySelector("#callback-error").textContent = errorMessage(error);
  });
