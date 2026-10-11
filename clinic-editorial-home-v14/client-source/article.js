const menu = document.querySelector(".mobile-navigation");
menu?.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => {
    menu.open = false;
  }),
);
menu?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    menu.open = false;
    menu.querySelector("summary").focus();
  }
});
// Static, native medical content. No HTML injection, booking model or new controller.
