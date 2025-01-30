export function setClaimMessage({ type, message }: { type: string; message: string }): void {
  const claimMessageType = document.querySelector(`.receipt > .head .row`) as Element;
  const claimMessageBody = document.querySelector(`.receipt > .head .cell`) as Element;
  claimMessageType.innerHTML = `<div>${type}</div>`;
  claimMessageBody.innerHTML = `<div>${message}</div>`;
}
