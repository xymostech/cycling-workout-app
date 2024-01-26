export function formatDurationForInterval(duration: number) {
  if (duration % 3600 === 0) {
    return `${duration / 3600}h`;
  } else if (duration % 60 === 0) {
    return `${duration / 60}m`;
  } else {
    return `${duration}s`;
  }
}

export function formatDuration(d: number) {
  const hrs = Math.floor(d / 3600);
  const mins = Math.floor((d % 3600) / 60);
  const secs = d % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
}
