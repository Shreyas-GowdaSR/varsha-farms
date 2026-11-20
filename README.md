# Varsha Farms website

Static website for Varsha Farms, Sontenahalli (near Bengaluru). Owner: Raju S T.
Amingad (Yelaga) sheep, shed-raised.

- Plain HTML, CSS and JavaScript. No framework and no build step.
- Pages: Home, Our sheep (Explore), About, Contact, plus a password-protected Owner page.
- Languages: English, Hindi and Kannada. All fixed text is in `i18n/en.json`, `i18n/hi.json` and `i18n/kn.json`.
- Sheep data is entered once, in `data/sheep.json`, usually through the Owner page.

## Folder map

| Path | What it holds |
|---|---|
| `index.html`, `explore.html`, `about.html`, `contact.html` | Public pages |
| `owner.html` | Owner page: add, edit and delete sheep, change status, manage home-page photos and videos |
| `assets/css/site.css` | All styles (colours are set at the top) |
| `assets/js/app.js` | Language switch, sheep cards, filters, home page and map |
| `assets/js/owner.js` | Owner page: image compression and saving |
| `i18n/*.json` | Translations. Keep the same keys in all three files. |
| `data/sheep.json` | Sheep list |
| `data/home.json` | Home-page top banner and gallery, in display order |
| `data/site.json` | Phone numbers and map position |
| `data/owner.json` | Created by first-time setup: encrypted GitHub token for the Owner page |
| `media/home/`, `media/sheep/` | Photos and videos |
| `server.js` | Optional zero-dependency Node server, for local preview or a VPS |

## Run it on your computer

```bash
node server.js
```

Open http://localhost:8080. On localhost the Owner page opens without a password and saves directly to disk.

## Deploy on GitHub Pages (free)

1. Push this folder to a **public** GitHub repository.
2. In the repository, open **Settings → Pages**. Choose **Deploy from a branch**, then branch `main` and folder `/ (root)`.
3. The site goes live at `https://<user>.github.io/<repo>/`.

Netlify and Cloudflare Pages also work. Connect the repository with no build command and set the publish directory to `/`. On those hosts the `_headers` file sets the cache rules.

### Owner page setup (do this once, after the first deploy)

The Owner page saves each change as a commit to the repository. The host then redeploys, which takes about a minute.

1. On GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - Repository access: **Only select repositories**, then pick this repository.
   - Permissions: **Contents: Read and write**. Nothing else is needed.
2. Open `https://<your-site>/owner.html`. The first-time setup form appears. Enter:
   - the repository as `user/repo`
   - the branch (`main`)
   - the token
   - a new owner password, at least 8 characters
3. The token is encrypted in the browser with the owner password (PBKDF2 + AES-GCM) and saved as `data/owner.json`. From then on the owner only types the password.

Use a long password. The repository is public, so anyone can download the encrypted token. To change the password, use Owner page → Settings. To revoke access, delete the token on GitHub.

## Deploy on a VPS or any Node host (alternative)

```bash
OWNER_PASSWORD='a-long-password' PORT=8080 node server.js
```

The Owner page then saves straight to disk, and changes show immediately. The host needs a persistent disk.

## Owner page: what it does

- **Sheep:** add, edit or delete a sheep. One tap changes the status (Available, Booked, Sold). Photos are resized and compressed in the phone before upload: a 1400 px WebP plus a 600 px thumbnail. Videos up to 20 MB are accepted, and a poster frame is made automatically.
- **Home photos:** change the top banner, add gallery photos and videos, and reorder or remove them. Press **Save** after changes.
- Files that nothing uses any more are deleted from the repository automatically.

## Changing things by hand

- **Phone numbers or map:** edit `data/site.json`.
- **Wording:** edit the three `i18n/*.json` files. The English text inside the HTML files is only a fallback for when JavaScript is off.
- **Colours:** edit the variables at the top of `assets/css/site.css`.
- **Breeds, teeth or purposes:** add the option in `owner.html`, then add the matching translation key (for example `purpose.xyz`) to all three language files.

## Notes

- The home video (`media/home/farm-video.mp4`, 7 MB) loads only after the page has loaded. It is skipped on data-saver and on 2G/3G connections, where the poster image shows instead. For faster loading, re-encode it to about 2 MB (720p, around 15 seconds) and upload it from the Owner page.
- Vaccination and deworming details are deliberately not shown on the site.
- Have a native speaker review the Hindi and Kannada text, especially the local name "Yelaga" (ಯಳಗ / येलगा).
