# Uploading screenshots to a PR

`gh` cannot upload images. GitHub hosts an image only when it is attached through its web editor, which then hands back a `https://github.com/user-attachments/...` URL. Use the PR's comment box as the uploader, copy the URLs into the PR body, and post nothing.

This needs the user's own signed-in browser.

1. **Check the sign-in.** Open the PR page and read `document.querySelector('meta[name="user-login"]')?.content`. A login means you're ready. If it's `null`, the page says "Sign in to comment". Ask the user to sign in to github.com in that same browser window, then reload and check again.

2. **Attach the files.** The comment box's file input has the id `fc-new_comment_field`. Upload every screenshot to it in one call.

3. **Read back the URLs.** Wait a few seconds, then read the value of the textarea `#new_comment_field`. It holds one `<img ... src="https://github.com/user-attachments/assets/...">` tag per file. Done when there is one tag for every file you attached.

4. **Empty the comment box.** React ignores a plain `value` assignment, so use the native setter:

   ```js
   const t = document.getElementById("new_comment_field");
   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, "");
   t.dispatchEvent(new Event("input", { bubbles: true }));
   ```

5. **Write the body.** Put the `<img>` tags into the body file, set `alt` text that says what each one shows, and run `gh pr edit <number> --body-file <file>`.

6. **Verify.** `gh pr view <number> --json body -q .body | grep -c user-attachments` equals the number of images, and `gh pr view <number> --json comments -q '.comments | length'` is unchanged.
