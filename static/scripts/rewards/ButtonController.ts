import { RewardPermit } from "./render-transaction/tx-type";

const LOADER = "data-loader";
const MAKE_CLAIM = "data-make-claim";
const VIEW_CLAIM = "data-view-claim";

const INVALIDATOR = "data-invalidator";

export class ButtonController {
  //Functionality needs to be changed to work per reward
  setAttribute(rewards: (RewardPermit | undefined)[], attribute: string, value: string) {
    rewards.forEach((reward) => {
      if (!reward) return;
      const controls = document.getElementById(reward.permit.nonce.toString())?.querySelector(".controls") as HTMLDivElement;
      controls.setAttribute(attribute, value);
    });
  }

  constructor() {
    this.hideAll();
  }

  public showLoader(...rewards: (RewardPermit | undefined)[]): void {
    if (window.ethereum) {
      this.setAttribute(rewards, LOADER, "true");
    } else {
      throw new Error("Can not show loader without `ethereum`");
    }
  }

  public hideLoader(...rewards: (RewardPermit | undefined)[]): void {
    this.setAttribute(rewards, LOADER, "false");
  }

  public hideMakeClaim(...rewards: (RewardPermit | undefined)[]): void {
    this.setAttribute(rewards, MAKE_CLAIM, "false");
  }

  public showMakeClaim(...rewards: (RewardPermit | undefined)[]): void {
    if (window.ethereum) {
      this.setAttribute(rewards, MAKE_CLAIM, "true");
    } else {
      throw new Error("Can not show make claim button without `ethereum`");
    }
  }

  public hideViewClaim(...rewards: (RewardPermit | undefined)[]): void {
    this.setAttribute(rewards, VIEW_CLAIM, "false");
  }

  public showViewClaim(...rewards: (RewardPermit | undefined)[]): void {
    this.setAttribute(rewards, VIEW_CLAIM, "true");
  }

  public hideInvalidator(...rewards: (RewardPermit | undefined)[]): void {
    this.setAttribute(rewards, INVALIDATOR, "false");
  }

  public showInvalidator(...rewards: (RewardPermit | undefined)[]): void {
    if (window.ethereum) {
      this.setAttribute(rewards, INVALIDATOR, "true");
    } else {
      throw new Error("Can not show invalidator button without `ethereum`");
    }
  }

  public onlyShowLoader(...rewards: (RewardPermit | undefined)[]): void {
    this.hideMakeClaim(...rewards);
    this.hideViewClaim(...rewards);
    this.hideInvalidator(...rewards);
    this.showLoader(...rewards);
  }

  public onlyShowMakeClaim(...rewards: (RewardPermit | undefined)[]): void {
    this.hideLoader(...rewards);
    this.showMakeClaim(...rewards);
    this.hideViewClaim(...rewards);
    this.hideInvalidator(...rewards);
  }

  public onlyShowViewClaim(...rewards: (RewardPermit | undefined)[]): void {
    this.hideLoader(...rewards);
    this.hideMakeClaim(...rewards);
    this.showViewClaim(...rewards);
    this.hideInvalidator(...rewards);
  }

  public onlyShowInvalidator(...rewards: (RewardPermit | undefined)[]): void {
    this.hideLoader(...rewards);
    this.hideMakeClaim(...rewards);
    this.hideViewClaim(...rewards);
    this.showInvalidator(...rewards);
  }

  public hideAll(...rewards: (RewardPermit | undefined)[]): void {
    this.hideLoader(...rewards);
    this.hideMakeClaim(...rewards);
    this.hideViewClaim(...rewards);
    this.hideInvalidator(...rewards);
  }
}
