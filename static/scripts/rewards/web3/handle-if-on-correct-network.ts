import { buttonController } from "../button-controller";

export function handleIfOnCorrectNetwork(currentNetworkId: number, desiredNetworkId: number) {
  if (desiredNetworkId === currentNetworkId) {
    buttonController.showMakeClaim();
  } else {
    buttonController.hideMakeClaim();
  }
}
