import { BRAND, orgLine } from "./brand";

/** The lower third's HTML: product, organisation line and tagline, and the team when set. */
export function lowerThird(brand: typeof BRAND = BRAND, org = orgLine()): string {
  const team = brand.team ? `<span><i>Team</i>${brand.team}</span>` : "";
  return `<b>${brand.product}</b><span><i>${org}</i>${brand.tagline}</span>${team}`;
}

// The script the recorder installs in every page. It draws a visible cursor, so a viewer
// can follow each click, the lower third, which sits in the opening screen's empty right
// column clear of the signed report, and the camera moves the storyboard calls. It runs in
// the browser, so it is plain JavaScript in a string, built once per take.
export function overlay(lower: string = lowerThird()): string {
  return `
(() => {
  const install = () => {
    if (document.getElementById("__rec_cursor")) return;
    const c = document.createElement("div");
    c.id = "__rec_cursor";
    c.innerHTML = '<svg width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16.5 L10.5 24 L14 22.5 L10.6 15.2 L17.5 15 Z" fill="#f4f2ec" stroke="#0e1012" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0px", top: "0px", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-2px,-2px)", willChange: "left, top" });
    const ring = document.createElement("div");
    ring.id = "__rec_ring";
    Object.assign(ring.style, { position: "fixed", width: "34px", height: "34px", marginLeft: "-17px", marginTop: "-17px", border: "2px solid #f4b400", borderRadius: "50%", opacity: "0", zIndex: "2147483646", pointerEvents: "none", transition: "opacity 420ms ease-out, transform 420ms ease-out" });
    document.documentElement.appendChild(ring);
    document.documentElement.appendChild(c);
    const x = Number(sessionStorage.getItem("__rec_x") ?? -40);
    const y = Number(sessionStorage.getItem("__rec_y") ?? -40);
    c.style.left = x + "px"; c.style.top = y + "px";
    window.addEventListener("mousemove", (e) => {
      c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px";
      sessionStorage.setItem("__rec_x", String(e.clientX)); sessionStorage.setItem("__rec_y", String(e.clientY));
    }, true);
    window.addEventListener("mousedown", (e) => {
      ring.style.transition = "none"; ring.style.left = e.clientX + "px"; ring.style.top = e.clientY + "px";
      ring.style.opacity = "0.55"; ring.style.transform = "scale(0.4)";
      requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.transition = "opacity 420ms ease-out, transform 420ms ease-out"; ring.style.opacity = "0"; ring.style.transform = "scale(1.3)"; }));
    }, true);
  };
  const edit = () => {
    if (document.getElementById("__rec_style")) return;
    const st = document.createElement("style");
    st.id = "__rec_style";
    st.textContent = "html *::-webkit-scrollbar{display:none!important;width:0!important;height:0!important} html *{scrollbar-width:none!important}" +
      "#__rec_lower{position:fixed;left:236px;bottom:40px;z-index:2147483645;pointer-events:none;display:flex;align-items:stretch;background:#0e1012;color:#eceae4;border:1px solid #363d44;font-family:var(--font-body);transition:opacity 500ms ease,transform 500ms ease;opacity:0;transform:translateY(12px);box-shadow:0 20px 50px rgba(0,0,0,.5)}" +
      "#__rec_lower b{font-family:var(--font-display);font-weight:800;text-transform:uppercase;font-size:40px;line-height:1;padding:16px 22px;background:#f4b400;color:#1a1400;display:flex;align-items:center}" +
      "#__rec_lower span{display:flex;flex-direction:column;justify-content:center;padding:10px 22px;font-size:17px;line-height:1.35;border-left:1px solid #363d44}" +
      "#__rec_lower i{font-style:normal;color:#f4b400;font-family:var(--font-code);font-size:12px;letter-spacing:.14em;text-transform:uppercase}";
    document.documentElement.appendChild(st);
    const lower = document.createElement("div");
    lower.id = "__rec_lower";
    lower.innerHTML = ${JSON.stringify(lower)};
    document.documentElement.appendChild(lower);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { install(); edit(); }); else { install(); edit(); }

  // The camera. It moves the whole page, drawer included, so an element sits centred and scaled.
  window.__cam = {
    zoom(r, s, ms) {
      const b = document.body;
      const W = innerWidth, H = innerHeight;
      let tx = W / 2 - s * (r.x + r.width / 2);
      let ty = H / 2 - s * (r.y + r.height / 2);
      tx = Math.min(0, Math.max(W - s * W, tx));
      ty = Math.min(0, Math.max(H - s * H, ty));
      b.style.transformOrigin = "0 0";
      b.style.transition = "transform " + ms + "ms cubic-bezier(0.45,0,0.2,1)";
      b.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")";
      const c = document.getElementById("__rec_cursor");
      if (c) c.style.opacity = "0";
    },
    reset(ms) {
      const b = document.body;
      b.style.transition = "transform " + ms + "ms cubic-bezier(0.45,0,0.2,1)";
      b.style.transform = "none";
      const c = document.getElementById("__rec_cursor");
      if (c) setTimeout(() => { c.style.opacity = "1"; }, ms);
    },
    ring(r, ms, tone) {
      const d = document.createElement("div");
      const pad = 8;
      Object.assign(d.style, { position: "fixed", left: (r.x - pad) + "px", top: (r.y - pad) + "px", width: (r.width + 2 * pad) + "px", height: (r.height + 2 * pad) + "px",
        border: "3px solid " + (tone === "gap" ? "#f0564a" : "#f4b400"), borderRadius: "6px", zIndex: "2147483644", pointerEvents: "none", opacity: "0",
        transform: "scale(1.04)", transition: "opacity 260ms ease-out, transform 260ms ease-out" });
      document.body.appendChild(d);
      requestAnimationFrame(() => requestAnimationFrame(() => { d.style.opacity = "1"; d.style.transform = "none"; }));
      setTimeout(() => { d.style.opacity = "0"; setTimeout(() => d.remove(), 300); }, ms);
    },
    scroll(testId, ms, at) {
      const el = document.querySelector('[data-testid="' + testId + '"]');
      const root = document.getElementById("scroll-root");
      if (!el || !root) return;
      const from = root.scrollTop;
      const to = Math.max(0, from + el.getBoundingClientRect().top - innerHeight * (at ?? 0.3));
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        root.scrollTop = from + (to - from) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    lower(show) {
      const l = document.getElementById("__rec_lower");
      if (!l) return;
      l.style.opacity = show ? "1" : "0";
      l.style.transform = show ? "none" : "translateY(12px)";
    },
  };
})();
`;
}
