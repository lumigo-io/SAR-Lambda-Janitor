{
  inputs = {
    nixpkgs.url = "nixpkgs/nixpkgs-25.05-darwin";
    flake-utils.url = "github:numtide/flake-utils";
    flake-compat = {
      url = "github:edolstra/flake-compat";
      flake = false;
    };
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages."${system}";
        ciDeps = with pkgs; [
          nodejs_22
        ];
      in
      {
        devShells = {
          # Used in CI
          default = pkgs.mkShell {
            name = "schemas-env";
            packages = ciDeps;
          };

          # recommended .envrc: use flake .#development
          development = pkgs.mkShell {
            packages =
              ciDeps
              ++ (with pkgs; [

              ]);
          };
        };
      }
    );
}
