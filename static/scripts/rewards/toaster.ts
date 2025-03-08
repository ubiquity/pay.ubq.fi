//import { ButtonController } from "./button-controller";

export const toaster = {
  create: createToast,
  error: errorToast,
  icons: {
    success: "fa-circle-check",
    error: "fa-circle-xmark",
    warning: "fa-triangle-exclamation",
    info: "fa-circle-info",
  },
};

const notifications = document.querySelector(".notifications") as HTMLUListElement;

function createToast(meaning: keyof typeof toaster.icons, text: string, timeout: number = 5000) {
  //if (meaning != "info") buttonController.hideLoader();
  const toastDetails = {
    timer: timeout,
  } as {
    timer: number;
    timeoutId?: NodeJS.Timeout;
  };
  // Getting the icon and text for the toast based on the id passed
  const _icon = toaster.icons[meaning];
  const toastContent = document.createElement("li"); // Creating a new 'li' element for the toast
  toastContent.className = `toast .${_icon} ${meaning}`; // Setting the classes for the toast

  // Setting the inner HTML for the toast
  toastContent.innerHTML = `<div class="column"><i class="fa-solid ${_icon}"></i><span>${text}</span></div>`;

  // attaching a click event listener to the toast to remove it when the close icon is clicked
  const i = document.createElement("i");
  i.className = "fa-solid fa-xmark";
  i.onclick = () => removeToast(toastContent, toastDetails.timeoutId);
  toastContent.appendChild(i);

  notifications.appendChild(toastContent); // Append the toast to the notification ul

  if (timeout !== Infinity) {
    // Setting a timeout to remove the toast after the specified duration
    toastDetails.timeoutId = setTimeout(() => removeToast(toastContent, toastDetails.timeoutId), toastDetails.timer);
  }
}

function removeToast(toast: HTMLElement, timeoutId?: NodeJS.Timeout) {
  toast.classList.add("hide");
  if (timeoutId) {
    clearTimeout(timeoutId); // Clearing the timeout for the toast
  }
  setTimeout(() => toast.remove(), 500); // Removing the toast after 500ms
}

export function errorToast(error: MetaMaskError, errorMessage?: string) {
  // If a custom error message is provided, use it
  if (errorMessage) {
    toaster.create("error", errorMessage);
    return;
  }

  toaster.create("error", error.reason);
}

export type MetaMaskError = {
  reason: "user rejected transaction";
  code: "ACTION_REJECTED";
  action: "sendTransaction";
  transaction: {
    data: "0x30f28b7a000000000000000000000000e91d153e0b41518a2ce8dd3d7944fa863463a97d0000000000000000000000000000000000000000000000056bc75e2d631000008defcc81869c636cbdd4c06c9247db239d4368d5e14d39793cfc2047c43d9532ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000004007ce2083c7f3e18097aeb3a39bb8ec149a341d0000000000000000000000000000000000000000000000056bc75e2d6310000000000000000000000000000044ca15db101fd1c194467db6af0c67c6bbf4ab510000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000004165db9eaebb7ea1854531d5e23305ee72481845b6df34c458fbc4e5a0422c4c9d36a674a92f3c877a8ae7f0990e0f1b1e5a21d904d2be34fa75aa71905d940a451b00000000000000000000000000000000000000000000000000000000000000";
    to: "0x000000000022D473030F116dDEE9F6B43aC78BA3";
    from: "0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d";
    gasLimit: {
      type: "BigNumber";
      hex: "0x012c5a";
    };
  };
  error: {
    code: string;
    message: string;
    data: {
      code: string;
      message: string;
      data: string;
    };
  };
};
