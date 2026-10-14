function resizedWidgetBounds(bounds, workArea, height) {
  const bottom = bounds.y + bounds.height;
  return {
    x: bounds.x,
    y: Math.max(workArea.y, Math.min(bottom - height, workArea.y + workArea.height - height)),
    width: 324,
    height,
  };
}

module.exports = { resizedWidgetBounds };
