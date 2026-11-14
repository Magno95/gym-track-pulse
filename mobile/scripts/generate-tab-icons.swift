// Export sized SF Symbols for the four compact navigation icons and the larger
// central action, with matching assets at every screen density.
// Run: xcrun swift -module-cache-path /tmp/gymtrack-tab-icons-cache scripts/generate-tab-icons.swift
import AppKit
import Foundation

let output = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
  .appendingPathComponent("assets/navigation", isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let symbols = [
  ("session", "stopwatch"),
  ("exercises", "dumbbell"),
  ("history", "chart.xyaxis.line"),
  ("profile", "person.crop.circle")
]

func writeIcon(name: String, size: CGFloat, scale: Int, directory: URL = output, opaque: Bool = false, draw: () -> Void) throws {
  let pixels = Int(size) * scale
  let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  bitmap.size = NSSize(width: size, height: size)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
  // bitmap.size supplies the point-to-pixel scale to AppKit's drawing context.
  draw()
  NSGraphicsContext.restoreGraphicsState()
  let suffix = scale == 1 ? "" : "@\(scale)x"
  var exported = bitmap
  if opaque {
    let context = CGContext(data: nil, width: pixels, height: pixels, bitsPerComponent: 8,
      bytesPerRow: pixels * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    context.draw(bitmap.cgImage!, in: CGRect(x: 0, y: 0, width: pixels, height: pixels))
    exported = NSBitmapImageRep(cgImage: context.makeImage()!)
  }
  try exported.representation(using: .png, properties: [:])!
    .write(to: directory.appendingPathComponent("\(name)\(suffix).png"))
}

for scale in 1...3 {
  for (name, symbol) in symbols {
    guard let image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)?
      .withSymbolConfiguration(.init(pointSize: 21, weight: .regular)) else {
      fatalError("Missing SF Symbol: \(symbol)")
    }
    try writeIcon(name: name, size: 21, scale: scale) {
      let factor = min(20 / image.size.width, 20 / image.size.height)
      let width = image.size.width * factor
      let height = image.size.height * factor
      image.draw(in: NSRect(x: (21 - width) / 2, y: (21 - height) / 2, width: width, height: height),
        from: .zero, operation: .sourceOver, fraction: 1)
    }
  }
  try writeIcon(name: "new-session", size: 36, scale: scale) {
    // Nike's public brand-orange token: #FF5000.
    NSColor(srgbRed: 1, green: 80 / 255, blue: 0, alpha: 1).setFill()
    NSBezierPath(ovalIn: NSRect(x: 1, y: 1, width: 34, height: 34)).fill()
    NSColor(srgbRed: 17 / 255, green: 17 / 255, blue: 17 / 255, alpha: 1).setStroke()
    let plus = NSBezierPath()
    plus.lineWidth = 2.4
    plus.lineCapStyle = .round
    plus.move(to: NSPoint(x: 11, y: 18)); plus.line(to: NSPoint(x: 25, y: 18))
    plus.move(to: NSPoint(x: 18, y: 11)); plus.line(to: NSPoint(x: 18, y: 25))
    plus.stroke()
  }
}
let brandDirectory = output.deletingLastPathComponent().appendingPathComponent("brand", isDirectory: true)
try FileManager.default.createDirectory(at: brandDirectory, withIntermediateDirectories: true)
try writeIcon(name: "icon", size: 1024, scale: 1, directory: brandDirectory, opaque: true) {
  NSColor(srgbRed: 1, green: 80 / 255, blue: 0, alpha: 1).setFill()
  NSRect(x: 0, y: 0, width: 1024, height: 1024).fill()
  let configuration = NSImage.SymbolConfiguration(pointSize: 480, weight: .semibold)
    .applying(.init(paletteColors: [NSColor(srgbRed: 17 / 255, green: 17 / 255, blue: 17 / 255, alpha: 1)]))
  let image = NSImage(systemSymbolName: "dumbbell.fill", accessibilityDescription: nil)!
    .withSymbolConfiguration(configuration)!
  let factor = min(640 / image.size.width, 540 / image.size.height)
  let width = image.size.width * factor
  let height = image.size.height * factor
  image.draw(in: NSRect(x: (1024 - width) / 2, y: (1024 - height) / 2, width: width, height: height),
    from: .zero, operation: .sourceOver, fraction: 1)
}
print("Generated navigation icons: 21 pt sections, 36 pt action, at 1x/2x/3x.")
