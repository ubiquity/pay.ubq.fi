const invalidateBtnInnerHTML = `<div>Void</div>
<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M256-213.847 213.847-256l224-224-224-224L256-746.153l224 224 224-224L746.153-704l-224 224 224 224L704-213.847l-224-224-224 224Z"/></svg>`;

// parse string and turn into an html entity
function parseHtml(html: string) {
  const button = document.createElement("button");
  button.id = "invalidateBtn";
  button.innerHTML = html;
  return button.cloneNode(true) as HTMLButtonElement;
}

export default parseHtml(invalidateBtnInnerHTML);
