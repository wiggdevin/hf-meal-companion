"use client";

import Sheet from "@/components/Sheet";
import Button from "@/components/ui/Button";

/**
 * Fast logging: what a barcode link (`/log?mode=barcode`, the home-screen icon) opens. The camera
 * stays off until the user taps Scan, so a link alone never asks for the camera or turns it on.
 */
export default function ScanReadySheet({ onScan, onSearch, onClose }: {
  onScan: () => void;
  onSearch: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Scan a barcode" onClose={onClose}
      footer={<div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" block onClick={onScan}>Scan</Button>
        <Button variant="tertiary" block onClick={onSearch}>Search instead</Button>
      </div>}>
      <p className="m-0 px-1 text-body text-graphite [text-wrap:pretty]">
        Tap Scan to turn on the camera, then point it at the barcode on the pack.
      </p>
    </Sheet>
  );
}
