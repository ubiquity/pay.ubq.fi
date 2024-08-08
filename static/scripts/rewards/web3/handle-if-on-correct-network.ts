import { buttonControllers } from "../toaster";

export function handleIfOnCorrectNetwork(currentNetworkId: number, desiredNetworkId: number) {
  if (desiredNetworkId === currentNetworkId) {
    buttonControllers.forEach((controller) => controller.showMakeClaim());
  } else {
    buttonControllers.forEach((controller) => controller.hideMakeClaim());
  }
}
