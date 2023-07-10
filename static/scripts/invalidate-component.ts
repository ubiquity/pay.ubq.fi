const invalidateBtnInnerHTML = `<div>Void</div>
<svg width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
<path d="M420.48 121.813 390.187 91.52 256 225.92 121.813 91.52 91.52 121.813 225.92 256 91.52 390.187l30.293 30.293L256 286.08l134.187 134.4 30.293-30.293L286.08 256z" fill="#000" fill-rule="evenodd" />
</svg>`;

// parse string and turn into an html entity
const parseHtml = (html: string) => {
  const button = document.createElement("button");
  button.id="invalidateBtn";
  button.innerHTML = html;
  return button.cloneNode(true) as HTMLButtonElement;
};

export default parseHtml(invalidateBtnInnerHTML);
