import puppeteer from "puppeteer-core";
const api = "http://localhost:5000/api";
const clickText = process.argv[2] || "Agregar producto";
const out = process.argv[3] || "/tmp/modal.png";

const res = await fetch(`${api}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@demo.com", password: "admin123" }),
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
await page.goto("http://localhost:5173/dashboard", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate((txt) => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.textContent.includes(txt),
  );
  if (btn) btn.click();
}, clickText);
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: out });
await browser.close();
console.log("ok", out);
