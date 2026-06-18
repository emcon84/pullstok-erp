import puppeteer from "puppeteer-core";

const url = process.argv[2] || "http://localhost:5173/dashboard";
const out = process.argv[3] || "/tmp/shot.png";
const email = process.argv[4] || "admin@demo.com";
const password = process.argv[5] || "admin123";
const api = "http://localhost:5000/api";

const res = await fetch(`${api}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const data = await res.json();

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.evaluate(
  (t, u) => {
    localStorage.setItem("token", t);
    if (u) localStorage.setItem("user", JSON.stringify(u));
  },
  data.accessToken,
  data.user,
);
await page.goto(url, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1800));
await page.screenshot({ path: out });
await browser.close();
console.log("ok", out);
