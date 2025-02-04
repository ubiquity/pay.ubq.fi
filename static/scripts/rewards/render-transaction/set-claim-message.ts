export function setClaimMessage({ type, message }: { type: string; message: string }): void {
  const claimMessageBody = document.querySelector(`#mainDetailsTable`) as Element;
  claimMessageBody.innerHTML = `<div><span id="notice">${type}</span><br/><br/>${message}</div>`;
}
