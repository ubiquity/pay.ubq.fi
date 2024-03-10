import { buttonController } from "../toaster";

export function handleIfOnCorrectNetwork(currentNetworkId: number, desiredNetworkId: number) {
  if (desiredNetworkId === currentNetworkId) {
    buttonController.showInvalidator();
  } else {
    buttonController.hideInvalidator();
  }
}
