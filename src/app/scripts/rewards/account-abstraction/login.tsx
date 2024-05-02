"use client";
import { useState } from "react";
import HelpModal from "./help-modal";
import { createPasskeyHandler } from "./webauthn";

export default function Login({
  permits,
  abortController,
  setHasCreds,
}: {
  abortController: AbortController;
  setHasCreds: (creds: boolean) => void;
  permits?: string;
}) {
  const [shouldShowModal, setShowModal] = useState(false);

  function helpHandler() {
    setShowModal(true);
  }

  return (
    <>
      {shouldShowModal && <HelpModal close={setShowModal} />}
      <thead>
        <tr>
          <th>
            <div>Username</div>
          </th>
          <td>
            <input name="username" id="loginform.username" autocomplete="username webauthn" />
          </td>
        </tr>
        <tr>
          <th></th>
          <td>
            <div className="button-container">
              <button className="help-button" type="button" onClick={helpHandler}>
                Help
              </button>
              <button type="submit" onClick={() => createPasskeyHandler({ permits, abortController, setHasCreds })}>
                Login
              </button>
            </div>
          </td>
        </tr>
      </thead>
    </>
  );
}
