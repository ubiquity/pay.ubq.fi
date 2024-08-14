import { buttonControllers } from "../toaster";

export function handleIfOnCorrectNetwork(currentNetworkId: number, desiredNetworkId: number) {
  // Show or hide claim action for each permit
  if (desiredNetworkId === currentNetworkId) {
    Object.keys(buttonControllers).forEach((key) => buttonControllers[key].showMakeClaim());
  } else {
    Object.keys(buttonControllers).forEach((key) => buttonControllers[key].hideMakeClaim());
  }
}
