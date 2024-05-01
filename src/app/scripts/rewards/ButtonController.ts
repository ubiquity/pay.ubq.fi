const LOADER = "data-loader";
const MAKE_CLAIM = "data-make-claim";
const VIEW_CLAIM = "data-view-claim";
const INVALIDATOR = "data-invalidator";

export class ButtonController {
  private _controls: HTMLDivElement;

  constructor(controls: HTMLDivElement) {
    this._controls = controls;
    this.hideAll();
  }

  public showLoader(): void {
    this._controls.setAttribute(LOADER, "true");
  }

  public hideLoader(): void {
    this._controls.setAttribute(LOADER, "false");
  }

  public hideMakeClaim(): void {
    this._controls.setAttribute(MAKE_CLAIM, "false");
  }

  public showMakeClaim(): void {
    this._controls.setAttribute(MAKE_CLAIM, "true");
  }

  public hideViewClaim(): void {
    this._controls.setAttribute(VIEW_CLAIM, "false");
  }

  public showViewClaim(): void {
    this._controls.setAttribute(VIEW_CLAIM, "true");
  }

  public hideInvalidator(): void {
    this._controls.setAttribute(INVALIDATOR, "false");
  }

  public showInvalidator(): void {
    this._controls.setAttribute(INVALIDATOR, "true");
  }

  public onlyShowLoader(): void {
    this.hideMakeClaim();
    this.hideViewClaim();
    this.hideInvalidator();
    this.showLoader();
  }

  public onlyShowMakeClaim(): void {
    this.hideLoader();
    this.showMakeClaim();
    this.hideViewClaim();
    this.hideInvalidator();
  }

  public onlyShowViewClaim(): void {
    this.hideLoader();
    this.hideMakeClaim();
    this.showViewClaim();
    this.hideInvalidator();
  }

  public onlyShowInvalidator(): void {
    this.hideLoader();
    this.hideMakeClaim();
    this.hideViewClaim();
    this.showInvalidator();
  }

  public hideAll(): void {
    this.hideLoader();
    this.hideMakeClaim();
    this.hideViewClaim();
    this.hideInvalidator();
  }
}
