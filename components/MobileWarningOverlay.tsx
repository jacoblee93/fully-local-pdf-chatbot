export function MobileWarningOverlay() {
  return (
    <div className="sm:hidden fixed inset-0 flex items-center justify-center bg-black bg-opacity-90 z-50">
      <div className="bg-black p-4 rounded shadow-lg text-center">
        It looks like you are on a mobile device.
        <br />
        <br />
        The local LLMs used for this app are only designed to work on desktop.
        <br />
        <br />
        Please come back once you're at a computer!
      </div>
    </div>
  );
}