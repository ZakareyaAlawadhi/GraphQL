// js/config.js

export const ENDPOINTS = {
  graphql: "https://learn.reboot01.com/api/graphql-engine/v1/graphql",
  signin: "https://learn.reboot01.com/api/auth/signin",
};

// LocalStorage key where we store the JWT
export const STORAGE_KEYS = {
  token: "reboot01_jwt",
};

// Backward-compatible constant used by auth.js
export const API_AUTH_SIGNIN = ENDPOINTS.signin;
