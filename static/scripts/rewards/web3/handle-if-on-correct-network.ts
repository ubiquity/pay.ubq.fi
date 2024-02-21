import invalidateButton from "../invalidate-component";
import { showLoader } from "../toaster";

export function handleIfOnCorrectNetwork(currentNetworkId: number, desiredNetworkId: number) {
  if (desiredNetworkId === currentNetworkId) {
    // enable the button once on the correct network
    invalidateButton.disabled = false;
  } else {
    showLoader();
    invalidateButton.disabled = true;
  }
}
