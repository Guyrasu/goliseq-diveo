
import {
	EditorView,
	Decoration,
	DecorationSet,
	ViewPlugin,
	ViewUpdate,
	WidgetType
} from "@codemirror/view"
import { Plugin } from "obsidian"
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state"

function getEmbedUrl(url: string): string {
	if (url.includes("youtube.com/watch?v=")) return url.replace("watch?v=", "embed/");
	if (url.includes("youtu.be/")) return url.replace("youtu.be/", "youtube.com/embed/");
	return url;
}





export default class LogSeqVideo extends Plugin {
	async onload() {
		console.log('loading plugin')
		this.registerEditorExtension([videoPositions, videoViewPlugin]);
		


		this.registerMarkdownPostProcessor((element, context) => {
			// We target the container directly. 
			// Logic: Find any element that contains the string "{{video"
			const entries = element.querySelectorAll("p, li, span");

			entries.forEach((el) => {
				const htmlElement = el as HTMLElement;
				// Check if the syntax exists in this element
				if (htmlElement.innerText.includes("{{video")) {
					
					const regex = /{{video\s+(https?:\/\/[^\s}]+)}}/g;
					
					// We replace based on the innerHTML to catch any hidden 
					// HTML tags Obsidian might have added to the URL
					const matches = htmlElement.innerText.matchAll(regex);
					let hasMatch = false;
					let currentContent = htmlElement.innerText;

					for (const match of matches) {
						hasMatch = true;
						const fullSyntax = match[0];
						const url = match[1];

						const iframeHTML = `<iframe 
							class="logseq-video-embed" 
							src="${url}" 
							frameborder="0" 
							allowfullscreen="true" 
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
						</iframe>`;

						// Replace the text version with the iframe
						currentContent = currentContent.replace(fullSyntax, iframeHTML);
					}

					if (hasMatch) {
						// Overwrite the entire element content with our new mix of text and iframes
						htmlElement.innerHTML = currentContent;
					}
				}
			});
		});
	}

	async onunload() {
		console.log('unloading plugin')
	}

}











// iframe element
class VideoWidget extends WidgetType {
    constructor(readonly url: string) { super() }

    eq(other: VideoWidget): boolean {
        return other.url === this.url;
    }

    toDOM(): HTMLElement {
		const iframe = document.createElement('iframe');
		iframe.src = getEmbedUrl(this.url) || "";
		iframe.classList.add('logseq-video-embed');
		// Important for CodeMirror layout stability
		iframe.style.display = "block"; 
		iframe.style.width = "100%";
		iframe.style.aspectRatio = "16 / 9";
		return iframe;
	}
}




// Define the Plugin that scans the editor text
export const videoViewPlugin = ViewPlugin.fromClass( class {
	decorations: DecorationSet

	constructor(view: EditorView) {
		this.decorations = this.buildDecorations(view)
	}

	update(update: ViewUpdate) {
		const head = update.state.selection.main.head
		const prevHead = update.startState.selection.main.head

		// Check if the cursor moved to a DIFFERENT line
		const lineChanged = update.state.doc.lineAt(head).number !== update.startState.doc.lineAt(prevHead).number

		// Only rebuild if:
		// 1. The text changed (docChanged)
		// 2. The user scrolled (viewportChanged)
		// 3. The cursor moved to a NEW line (lineChanged)
		if ( update.docChanged || update.viewportChanged || lineChanged ) {
			this.decorations = this.buildDecorations(update.view)
		}
	}

	buildDecorations(view: EditorView) {
		const builder = [];
		
		// SAFETY CHECK: If the state field isn't initialized yet, return empty decorations
		try {
			const field = view.state.field(videoPositions);
			if (!field) return Decoration.none;

			const selection = view.state.selection.main;
			const cursorLine = view.state.doc.lineAt(selection.head);

			field.between(view.viewport.from, view.viewport.to, (from, to) => {
				const matchLine = view.state.doc.lineAt(from);
				const fullText = view.state.doc.sliceString(from, to);
				const urlMatch = fullText.match(/{{video\s+(https?:\/\/[^\s}]+)}}/);
				const url = urlMatch ? urlMatch[1] : "";

				if (cursorLine.number !== matchLine.number) {
					builder.push(
						Decoration.replace({
							widget: new VideoWidget(url),
						}).range(from, to)
					);
				}
			});
		} catch (e) {
			// If the field is missing, just return nothing for this frame
			return Decoration.none;
		}

		return Decoration.set(builder.sort((a, b) => a.from - b.from));
	}
}, {
	decorations: (v) => v.decorations
})








function buildVideoPositions(text: string) {
	const builder = new RangeSetBuilder<Decoration>();
	const regex = /{{video\s+(https?:\/\/[^\s}]+)}}/g;
	let match;
	while ((match = regex.exec(text)) !== null) {
		builder.add(match.index, match.index + match[0].length, Decoration.mark({
			class: "video-syntax-marker"
		}));
	}
	return builder.finish();
}

const videoPositions = StateField.define<DecorationSet>({
	create(state) { 
		return buildVideoPositions(state.doc.toString());
	},
	update(value, tr) {
		// Only re-scan the regex if the document changed
		if (tr.docChanged) {
			return buildVideoPositions(tr.state.doc.toString());
		}
		return value.map(tr.changes);
	}
})