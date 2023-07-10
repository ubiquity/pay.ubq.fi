export const claimButton = document.getElementById("claimButton") as HTMLButtonElement;
export const controls = document.getElementById("controls") as HTMLElement;

const notifications = document.querySelector(".notifications") as HTMLElement;
const claimIcon = document.querySelector(".claim-icon") as HTMLElement;
const claimLoader = document.querySelector(".claim-loader") as HTMLElement;

// Object containing details for different types of toasts
const toastDetails = {
  timer: 5000,
  // timeoutId: null,
} as {
  timer: number;
  timeoutId?: NodeJS.Timeout;
};

const toastIcons = {
  success: "fa-circle-check",
  error: "fa-circle-xmark",
  warning: "fa-triangle-exclamation",
  info: "fa-circle-info",
};

export function createToast(icon: keyof typeof toastIcons, text: string) {
  // Getting the icon and text for the toast based on the id passed
  const _icon = toastIcons[icon];
  const toast = document.createElement("li"); // Creating a new 'li' element for the toast
  toast.className = `toast .${_icon}`; // Setting the classes for the toast

  // Setting the inner HTML for the toast
  toast.innerHTML = `<div class="column"><i class="fa-solid ${_icon}"></i><span>${text}</span></div>`;

  // attaching a click event listener to the toast to remove it when the close icon is clicked
  const i = document.createElement("i");
  i.className = "fa-solid fa-xmark";
  i.onclick = () => removeToast(toast, toastDetails.timeoutId);
  toast.appendChild(i);

  notifications.appendChild(toast); // Append the toast to the notification ul

  // Setting a timeout to remove the toast after the specified duration
  toastDetails.timeoutId = setTimeout(() => removeToast(toast, toastDetails.timeoutId), toastDetails.timer);
}

function removeToast(toast: HTMLElement, timeoutId?: NodeJS.Timeout) {
  toast.classList.add("hide");
  if (timeoutId) {
    clearTimeout(timeoutId); // Clearing the timeout for the toast
  }
  setTimeout(() => toast.remove(), 500); // Removing the toast after 500ms
}

export function disableClaimButton(triggerLoader = true) {
  claimButton.disabled = true;

  // Adding this because not all disabling should trigger loading spinner
  if (triggerLoader) {
    claimLoader?.classList.add("show-cl"), claimLoader?.classList.remove("hide-cl");
    claimIcon?.classList.add("hide-cl"), claimIcon?.classList.remove("show-cl");
  }
}

export function enableClaimButton() {
  claimButton.disabled = false;
  claimLoader?.classList.add("hide-cl"), claimLoader?.classList.remove("show-cl");
  claimIcon?.classList.add("show-cl"), claimIcon?.classList.remove("hide-cl");
}

export function ErrorHandler(error: any, errorMessage?: string) {
  delete error.stack;
  let ErrorData = JSON.stringify(error, null, 2);
  if (errorMessage) {
    createToast("error", errorMessage);
  } else if (error?.reason) {
    // parse error data to get error message
    const parsedError = JSON.parse(ErrorData);
    const _errorMessage = parsedError?.error?.message ?? parsedError?.reason;
    createToast("error", `Error: ${_errorMessage}`);
  }
}
