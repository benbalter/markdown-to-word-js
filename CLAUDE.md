# CLAUDE.md

Browser app that converts Markdown to Word documents, published with GitHub Pages. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup.

## Commands

Run these before pushing. They match [ci.yml](.github/workflows/ci.yml):

```sh
npm run lint    # eslint --fix: rewrites files, so review the diff it leaves
npm test        # vitest
npm run build   # tsc + vite build, output in dist/
```

## Deploying

- Pushing to `main` is a production deploy. [deploy.yml](.github/workflows/deploy.yml) publishes `dist/` to Pages after lint and build only. It doesn't run tests or wait for CI, so failing tests can still ship.
- So run all three checks above, then push or merge to `main` only when the owner says to.

## Generated files

The `*.lock.yml` workflows in [.github/workflows](.github/workflows) are compiled by [gh-aw](https://github.com/github/gh-aw) from the `.md` file beside each one. Edit the `.md` source and run `gh aw compile`; never hand-edit a `.lock.yml`.
