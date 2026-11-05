import React from "react";

/**
 * Top navigation bar.
 * @param {{ userName: string, onSignOut: () => void }} props
 */
export default function Nav({ userName, onSignOut }) {
  return (
    <nav>
      <span>{userName}</span>
      <button onClick={onSignOut}>Sign out</button>
    </nav>
  );
}
