import { Dispatch, SetStateAction } from "react";

export default function HelpModal({ close }: { close: Dispatch<SetStateAction<boolean>> }) {
  return (
    <div id="help-modal" className="modal">
      <div className="modal-content">
        <span className="close" onClick={() => close((prev) => !prev)}>
          &times;
        </span>
        <br />
        <ul>
          <li>After focusing on the input field, you will be prompted to use a passkey to login to your Ubiquity Rewards account.</li>
          <li>If you have already created an account, select the passkey you used to create your account.</li>
          <li>
            To create an account, ignore the passkey prompt and enter your username, it can be any username you like, although we recommend that it is not
            personally identifiable such as an email, or GitHub username.
          </li>
          <li>
            After entering your username, click on the login button and your new account will be created after completing the passkey registration process.
          </li>
          <li>We do not store any sensitive information with the exception of an account identifier in your browser's local storage for future logins.</li>
          <li>
            If an account exists in your local storage, you will not be able to create a new account with the same username this is to avoid duplicate keys
            being created for the same account. You can bypass this by clearing your local storage but it is not recommended.
          </li>
          <li>
            If your local storage is cleared, you can recover your account by using the passkey you used to create your account. If this is not an option,
            account recovery is not possible unless you have a backup of your private key.
          </li>
          <li>
            Backing up your private key can be done via the mnemonic phrase generated when you create your account. This phrase is not stored by us and is your
            responsibility to keep safe.
          </li>
          <br />
          <li>If you have any questions, please contact us on Discord.</li>
        </ul>
      </div>
    </div>
  );
}
