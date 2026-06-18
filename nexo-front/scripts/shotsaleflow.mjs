import puppeteer from "puppeteer-core";
const api = "http://localhost:5000/api";
const out = process.argv[2] || "/tmp/saleflow.png";

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
await page.goto("http://localhost:5173/Ventas", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1200));

const clickByText = (text, last = false) =>
  page.evaluate(
    (t, l) => {
      const bs = [...document.querySelectorAll("button")].filter(
        (x) => x.textContent.trim() === t,
      );
      const target = l ? bs[bs.length - 1] : bs[0];
      if (target) target.click();
    },
    text,
    last,
  );

await clickByText("Agregar venta");
await new Promise((r) => setTimeout(r, 700));
await clickByText("Agregar productos", true); // abre selector
await new Promise((r) => setTimeout(r, 700));

// seleccionar los 2 primeros productos (click en sus filas)
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[role="dialog"] button')].filter(
    (b) => b.querySelector("p"),
  );
  rows.slice(0, 2).forEach((r) => r.click());
});
await new Promise((r) => setTimeout(r, 500));

// confirmar en el dialog (boton del footer)
await clickByText("Agregar productos", true);
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: out });
await browser.close();
console.log("ok", out);
