import { logout } from "../_lib/auth.js";
export const onRequestPost = ({ env, request }) =>
  logout(env, request, "admin");
