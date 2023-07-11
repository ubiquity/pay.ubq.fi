export function setClaimMessage({ type, message }: { type: string; message: string }): void {
  const claimMessageType = document.querySelector(`table > thead th`) as Element;
  const claimMessageBody = document.querySelector(`table > thead td`) as Element;
  claimMessageType.innerHTML = `<div>${type}</div>`;
  claimMessageBody.innerHTML = `<div>${message}</div>`;
}
