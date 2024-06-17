export function attachActivateInfoAction() {
  const activateButtons: HTMLCollectionOf<Element> = document.getElementsByClassName("activate-btn");

  Array.from(activateButtons).forEach((activateButton: Element) => {
    (activateButton as HTMLButtonElement).addEventListener("click", async () => {
      const productId = Number(activateButton.parentElement?.parentElement?.parentElement?.getAttribute("data-product-id"));

      document.querySelector(`.redeem-info-wrapper[data-info-for="${productId}"]`)?.setAttribute("data-show", "true");
    });
  });

  const closeButtons: HTMLCollectionOf<Element> = document.getElementsByClassName("close-btn");

  Array.from(closeButtons).forEach((closeButton: Element) => {
    (closeButton as HTMLButtonElement).addEventListener("click", async () => {
      closeButton.parentElement?.parentElement?.setAttribute("data-show", "false");
    });
  });
}
