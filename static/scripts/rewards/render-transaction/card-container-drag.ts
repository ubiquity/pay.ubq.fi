const DRAG_THRESHOLD = 100; // px to drag before closing

/**
 * Attach drag events to a handle that can pull the container down.
 * @param container The #card-container element.
 * @param handle The .drag-handle element at the top of the container.
 */
export function handleDrag(container: HTMLDivElement, handle: HTMLDivElement): void {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  // Start drag
  function onPointerDown(e: PointerEvent) {
    // Only left-click or touch
    if (e.pointerType === "mouse" && e.buttons !== 1) {
      return;
    }
    isDragging = true;
    startY = e.clientY;
    currentY = startY;

    // Disable container's transition so it follows the pointer directly
    container.style.transition = "none";

    // Set the pointer capture so we continue to get events
    handle.setPointerCapture(e.pointerId);
  }

  // Move drag
  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;
    currentY = e.clientY;
    const deltaY = currentY - startY;

    // Only move the panel downward if user drags down (deltaY > 0)
    if (deltaY > 0) {
      container.style.transform = `translateY(${deltaY}px)`;
    }
  }

  // End drag
  function onPointerUp(e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false;

    handle.releasePointerCapture(e.pointerId);

    // Re-enable the transition
    container.style.transition = "transform 0.5s ease-in-out, opacity 0.5s ease-in-out";

    const deltaY = currentY - startY;

    if (deltaY > DRAG_THRESHOLD) {
      // If dragged sufficiently, close the panel
      container.classList.remove("visible");
      // Immediately reset transform so it is hidden
      container.style.transform = "translateY(100%)";
    } else {
      // Otherwise, snap back to fully visible
      container.style.transform = "translateY(0)";
    }
  }

  // Attach pointer event listeners to the handle
  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", onPointerUp);
}
