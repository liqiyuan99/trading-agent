import hashlib
import hmac
import os

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware

COOKIE_NAME = "sr_auth"
_LOGIN_PATH = "/login"


def _expected_token() -> str:
    password = os.getenv("APP_PASSWORD", "")
    return hmac.new(b"stockresearch-salt", password.encode(), hashlib.sha256).hexdigest()


def _is_authenticated(request: Request) -> bool:
    return request.cookies.get(COOKIE_NAME) == _expected_token()


_LOGIN_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>StockResearch — Login</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f9fafb;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 40px 36px;
      width: 100%;
      max-width: 360px;
    }
    h1 { font-size: 22px; font-weight: 700; color: #111; margin-bottom: 6px; }
    p  { font-size: 13px; color: #6b7280; margin-bottom: 28px; }
    label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px; }
    input[type=password] {
      width: 100%;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 15px;
      outline: none;
      margin-bottom: 16px;
      transition: border-color .15s;
    }
    input[type=password]:focus { border-color: #2563eb; box-shadow: 0 0 0 3px #dbeafe; }
    button {
      width: 100%;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 11px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s;
    }
    button:hover { background: #1d4ed8; }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      color: #dc2626;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>StockResearch</h1>
    <p>Enter the password to continue.</p>
    {error}
    <form method="POST" action="/login">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autofocus autocomplete="current-password"/>
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>"""


def login_page_html(error: bool = False) -> HTMLResponse:
    error_html = '<div class="error">Incorrect password — try again.</div>' if error else ""
    return HTMLResponse(_LOGIN_HTML.replace("{error}", error_html))


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        password = os.getenv("APP_PASSWORD", "")
        if not password:
            return await call_next(request)

        path = request.url.path

        # Always allow the login route through
        if path == _LOGIN_PATH:
            return await call_next(request)

        if _is_authenticated(request):
            return await call_next(request)

        # API calls get a 401 instead of a redirect
        if path.startswith("/api/"):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)

        return RedirectResponse(url=_LOGIN_PATH)
