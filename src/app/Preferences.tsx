import React, { useState } from "react";

import Button from "./Button";
import SegmentsChart from "./SegmentsChart";

import { formatDuration } from "./formatting";
import {
  parseSegment,
  formatSegment,
  getSegmentTotalDuration,
  getNormalizedPower,
  Segment,
} from "./segments";
import Storage from "./Storage";
import sum from "./sum";

export default function Preferences({ onClose }: { onClose: () => void }) {
  const [ftp, setFtp] = useState(`${Storage.getFTP()}`);
  const [formattedSegments, setFormattedSegments] = useState(
    Storage.getSegments().map(formatSegment).join("\n"),
  );
  const [lastGoodSegments, setLastGoodSegments] = useState(
    Storage.getSegments(),
  );
  const [segmentsGood, setSegmentsGood] = useState(true);

  function parseSegmentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (e.target) {
      const newSegments = e.target.value;

      setFormattedSegments(newSegments);

      try {
        const parsedSegments = newSegments
          .trim()
          .split("\n")
          .filter((x) => x.length > 0)
          .map(parseSegment);

        setLastGoodSegments(parsedSegments);
        setSegmentsGood(true);
      } catch (e) {
        setSegmentsGood(false);
      }
    }
  }

  function savePreferences() {
    Storage.setFTP(parseInt(ftp));
    Storage.setSegments(lastGoodSegments);
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-[700px] h-[600px] bg-white p-10 border-2 border-black rounded-md">
        <h2 className="mb-5 text-xl">Preferences</h2>
        <label>
          FTP:{" "}
          <input
            className="outline outline-1"
            type="number"
            value={ftp}
            onChange={(e) => setFtp(e.target.value)}
          />
        </label>
        <label>
          <div>Segments:</div>
          <textarea
            className="w-full h-[180px] font-mono outline outline-1 "
            value={formattedSegments}
            onChange={parseSegmentChange}
          ></textarea>
        </label>
        <div className="my-2">
          <SegmentsChart segments={lastGoodSegments} ftp={parseInt(ftp)} />
        </div>
        <Button onClick={savePreferences} disabled={!segmentsGood}>
          Save
        </Button>{" "}
        <Button onClick={onClose}>Close</Button>{" "}
        <span>
          Total duration:{" "}
          <span>
            {formatDuration(
              sum(
                lastGoodSegments.map((int: Segment) =>
                  getSegmentTotalDuration(int),
                ),
              ),
            )}
          </span>
        </span>{" "}
        <span>
          Est. NP: <span>{getNormalizedPower(lastGoodSegments)}</span>
        </span>
      </div>
    </div>
  );
}
