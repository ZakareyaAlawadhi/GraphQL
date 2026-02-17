import { signinBasic, setToken, getToken } from "./auth.js";

const form = document.getElementById("loginForm");
const idEl = document.getElementById("identifier");
const pwEl = document.getElementById("password");
const errEl = document.getElementById("loginError");

if (getToken()) {
  window.location.replace("./profile.html");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errEl.textContent = "";

  try {
    const token = await signinBasic(idEl.value.trim(), pwEl.value);
    setToken(token);
    window.location.replace("./profile.html");
  } catch (err) {
    errEl.textContent =
      "We couldn’t sign you in. Please check your username/email or password and try again.";
  }
});
