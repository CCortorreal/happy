fn main() {
  // option_env!("HAPPY_SELFHOST_URL") in lib.rs is evaluated at compile time and
  // cargo does NOT rebuild on env changes by default — so a changed URL would be
  // silently stale across builds (same class of bug as Metro's cached
  // EXPO_PUBLIC inlining). This forces a rebuild when the baked URL changes.
  println!("cargo:rerun-if-env-changed=HAPPY_SELFHOST_URL");
  tauri_build::build()
}
