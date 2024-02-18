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

export const claimButton = {
  loading: loadingClaimButton,
  reset: resetClaimButton,
  element: document.getElementById("claimButton") as HTMLButtonElement,
};

const notifications = document.querySelector(".notifications") as HTMLUListElement;

export function createToast(meaning: keyof typeof toaster.icons, text: string) {
  const toastDetails = {
    timer: 5000,
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

  // Setting a timeout to remove the toast after the specified duration
  toastDetails.timeoutId = setTimeout(() => removeToast(toastContent, toastDetails.timeoutId), toastDetails.timer);
}

function removeToast(toast: HTMLElement, timeoutId?: NodeJS.Timeout) {
  toast.classList.add("hide");
  if (timeoutId) {
    clearTimeout(timeoutId); // Clearing the timeout for the toast
  }
  setTimeout(() => toast.remove(), 500); // Removing the toast after 500ms
}

export function loadingClaimButton(triggerLoader = true) {
  claimButton.element.disabled = true;
  // Adding this because not all disabling should trigger loading spinner
  if (triggerLoader) {
    claimButton.element.classList.add("show-cl");
    claimButton.element.classList.remove("hide-cl");
  }
}

export function resetClaimButton() {
  claimButton.element.disabled = false;
  claimButton.element.classList.add("hide-cl");
  claimButton.element.classList.remove("show-cl");
}

export function hideClaimButton() {
  claimButton.element.disabled = true;
  claimButton.element.classList.add("hide-cl");
  claimButton.element.classList.remove("show-cl");
}

type Err = { stack?: unknown; reason?: string } extends Error ? Error : { stack?: unknown; reason?: string };

export function errorToast(error: Err, errorMessage?: string) {
  delete error.stack;
  const errorData = JSON.stringify(error, null, 2);
  if (errorMessage) {
    toaster.create("error", errorMessage);
  } else if (error?.reason) {
    // parse error data to get error message
    const parsedError = JSON.parse(errorData);
    const _errorMessage = parsedError?.error?.message ?? parsedError?.reason;
    toaster.create("error", _errorMessage);
  }
}
