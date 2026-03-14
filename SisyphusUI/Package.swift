// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SisyphusUI",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "SisyphusUI",
            path: "Sources/SisyphusUI"
        )
    ]
)
