// ============================================================
// MYDRAW - Vanilla JavaScript Whiteboard
// ============================================================

// ============================================================
// DOM
// ============================================================

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const workspace = document.getElementById("workspace");
const zoomLevel = document.getElementById("zoom-level");
const zoomInButton = document.getElementById("zoom-in");
const zoomOutButton = document.getElementById("zoom-out");

const toolButtons = document.querySelectorAll("[data-tool]");

const undoButton = document.getElementById("undo");
const redoButton = document.getElementById("redo");
const toolsMenu = document.getElementById("tools-menu");
const moreToolsButton = document.getElementById("more-tools");
const imagePicker = document.getElementById("image-picker");
const lockToggle = document.getElementById("lock-toggle");
const embedDialog = document.getElementById("embed-dialog");
const embedForm = document.getElementById("embed-form");
const embedUrlInput = document.getElementById("embed-url");
const stylePanel = document.getElementById("style-panel");
const opacityControl = document.getElementById("opacity-control");
const opacityValue = document.getElementById("opacity-value");


// ============================================================
// Canvas configuration
// ============================================================

const STORAGE_KEY = "my-whiteboard";

let canvasWidth = window.innerWidth;
let canvasHeight = window.innerHeight;


// ============================================================
// Application state
// ============================================================

let elements = [];

let currentTool = "pan";

let selectedElement = null;
let selectedElements = [];
let isLocked = false;
let currentFillColor = "#c9c6ff";
const loadedImages = new Map();
let lassoPoints = [];
let isMarqueeSelecting = false;
let marqueeStart = null;
let marqueeEnd = null;
let lastSelectClick = null;
let suppressNextCanvasClick = false;
let laserPoints = [];
let laserTimeout = null;
let laserExpiresAt = 0;
let activeEmbedId = null;
const embedOverlays = new Map();

// ============================================================
// Camera / Infinite Canvas
// ============================================================

let zoom = 1;

let viewOffsetX = 0;

let viewOffsetY = 0;


let isDrawing = false;

let isDragging = false;

let isPanning = false;

let isSpacePressed = false;

let startX = 0;
let startY = 0;

let currentX = 0;
let currentY = 0;

let lastMouseX = 0;
let lastMouseY = 0;

let lastMouseWorldX = 0;
let lastMouseWorldY = 0;

let previewElement = null;

let draggedElement = null;
let draggedElements = [];
let isResizing = false;
let resizeElement = null;
let resizeHandle = null;
let resizeStartBounds = null;
let resizeStartPointer = null;
let resizeOriginalElement = null;
let resizeGroupOriginals = [];
let isErasing = false;
let eraseHistorySaved = false;
let lastErasePoint = null;
let isRemoving = false;
let removeHistorySaved = false;

let dragOffsetX = 0;
let dragOffsetY = 0;

let panStartX = 0;
let panStartY = 0;

let activeTextEditor = null;



// ============================================================
// Drawing configuration
// ============================================================

const DEFAULT_STROKE = "#1e1e1e";
const DEFAULT_TEXT_COLOR = "#29211e";

const DEFAULT_FILL = "transparent";

const DEFAULT_LINE_WIDTH = 2.4;

const PEN_LINE_WIDTH = 3.2;

const SELECTION_COLOR = "#6965db";
const HANDWRITING_FONT = '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive';
const defaultStyle = {
    stroke: DEFAULT_STROKE,
    textColor: DEFAULT_STROKE,
    fill: "transparent",
    fillMode: "none",
    lineWidth: DEFAULT_LINE_WIDTH,
    strokeDash: "solid",
    roughness: 1,
    cornerStyle: "sharp",
    arrowType: "curved",
    arrowHeads: "end",
    fontFamily: HANDWRITING_FONT,
    fontSize: 24,
    textAlign: "left",
    opacity: 1
};

// ============================================================
// Undo / Redo
// ============================================================

let undoStack = [];

let redoStack = [];


// ============================================================
// Utility
// ============================================================

function generateId() {

    return (
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 9)
    );

}


function openTextEditor(element, x, y) {

    const isNote = !element && currentTool === "note";
    const textElement = element || {
        id: generateId(),
        type: isNote ? "note" : "text",
        x: isNote ? x - 220 : x,
        y: isNote ? y - 220 : y,
        text: "",
        fontSize: isNote ? 20 : defaultStyle.fontSize,
        fontFamily: defaultStyle.fontFamily,
        textAlign: isNote ? "center" : defaultStyle.textAlign,
        opacity: defaultStyle.opacity,
        width: isNote ? 440 : 320,
        height: isNote ? 440 : undefined,
        stroke: isNote ? "#d7c77b" : defaultStyle.stroke,
        textColor: defaultStyle.textColor,
        fill: isNote ? "#ffdf66" : defaultStyle.fill,
        fillMode: defaultStyle.fillMode,
        createdAt: isNote ? Date.now() : undefined
    };

    const input = document.createElement("textarea");
    input.className = "canvas-text-editor";
    input.setAttribute("aria-label", "Text on whiteboard");
    input.value = textElement.text || "";
    input.wrap = "soft";
    input.spellcheck = false;
    input.style.color = isNote || textElement.type === "note"
        ? textElement.textColor || DEFAULT_TEXT_COLOR
        : textElement.textColor || textElement.stroke || defaultStyle.textColor;
    if (textElement.type === "note") {
        input.classList.add("note-text-editor");
    }

    activeTextEditor = {
        element: element ? textElement : null,
        textElement,
        input
    };

    workspace.appendChild(input);
    updateTextEditorPosition();

    input.addEventListener("input", resizeTextEditor);
    input.addEventListener("blur", commitTextEditor);
    input.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            cancelTextEditor();
        }
        else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            commitTextEditor();
        }
    });

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    resizeTextEditor();

}


function resizeTextEditor() {

    if (!activeTextEditor) {
        return;
    }

    const { input, textElement } = activeTextEditor;
    const fontFamily = textElement.fontFamily || HANDWRITING_FONT;
    const fontSize = (textElement.fontSize || 24) * zoom;
    const screenWidth =
        Math.max(120, (textElement.width || 320) * zoom -
            (textElement.type === "note" ? 24 * zoom : 0));

    input.style.width = `${screenWidth}px`;
    input.style.fontFamily = fontFamily;
    input.style.fontSize = `${fontSize}px`;
    input.style.lineHeight = `${fontSize * 1.3}px`;
    input.style.opacity = String(textElement.opacity ?? 1);
    input.style.height = "auto";
    if (textElement.type === "note") {
        const noteHeight = (textElement.height || 440) * zoom;
        const lines = getTextLines({
            ...textElement,
            text: input.value,
            width: Math.max(32, (textElement.width || 440) - 32)
        });
        const contentHeight = lines.length * fontSize * 1.3;
        input.style.height = `${noteHeight - 28 * zoom}px`;
        input.style.padding = `${Math.max(0, (noteHeight - contentHeight) / 2 - 14 * zoom)}px ${16 * zoom}px ${12 * zoom}px`;
        input.style.textAlign = "center";
    }
    else {
        input.style.height = `${Math.max(input.scrollHeight, fontSize * 1.5)}px`;
        input.style.padding = "0";
        input.style.textAlign = textElement.textAlign || "left";
    }

}


function updateTextEditorPosition() {

    if (!activeTextEditor) {
        return;
    }

    const position = worldToScreen(
        activeTextEditor.textElement.x,
        activeTextEditor.textElement.y
    );
    const workspaceRect = workspace.getBoundingClientRect();

    const isNote = activeTextEditor.textElement.type === "note";
    const inset = isNote ? 12 * zoom : 0;
    activeTextEditor.input.style.left =
        `${position.x + canvas.getBoundingClientRect().left - workspaceRect.left + inset}px`;
    activeTextEditor.input.style.top =
        `${position.y + canvas.getBoundingClientRect().top - workspaceRect.top + inset}px`;

    resizeTextEditor();

}


function commitTextEditor() {

    if (!activeTextEditor) {
        return;
    }

    const editor = activeTextEditor;
    const text = editor.input.value;
    activeTextEditor = null;
    editor.input.remove();

    if (!text.trim()) {
        if (editor.element) {
            saveHistory();
            elements = elements.filter(element => element.id !== editor.element.id);
            saveToLocalStorage();
        }

        render();
        return;
    }

    if (editor.element) {
        if (editor.element.text === text) {
            render();
            return;
        }

        saveHistory();
        if (!editor.element.width) {
            editor.element.width = editor.textElement.width || 320;
        }
        editor.element.text = text;
        if (editor.element.type === "note") {
            editor.element.createdAt ||= Date.now();
        }
    }
    else {
        if (editor.textElement.type === "note" && !editor.textElement.createdAt) {
            editor.textElement.createdAt = Date.now();
        }
        saveHistory();
        editor.textElement.text = text;
        elements.push(editor.textElement);
    }

    saveToLocalStorage();
    render();

}


function cancelTextEditor() {

    if (!activeTextEditor) {
        return;
    }

    const editor = activeTextEditor;
    activeTextEditor = null;
    editor.input.remove();
    render();

}

document.addEventListener("mousedown", event => {
    if (!activeTextEditor || activeTextEditor.input.contains(event.target)) {
        return;
    }

    const shouldReturnToSelect = currentTool === "text" || currentTool === "note";
    commitTextEditor();
    if (shouldReturnToSelect) {
        selectTool("select");
    }
}, true);


// ============================================================
// Canvas resize
// ============================================================

function resizeCanvas() {

    const devicePixelRatio =
        window.devicePixelRatio || 1;

    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;

    canvas.width =
        canvasWidth * devicePixelRatio;

    canvas.height =
        canvasHeight * devicePixelRatio;

    canvas.style.width =
        `${canvasWidth}px`;

    canvas.style.height =
        `${canvasHeight}px`;

    ctx.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0
    );

    render();

}


window.addEventListener(
    "resize",
    resizeCanvas
);


// ============================================================
// Coordinate conversion
// ============================================================

function screenToWorld(screenX, screenY) {

    return {

        x:
            (screenX - viewOffsetX) /
            zoom,

        y:
            (screenY - viewOffsetY) /
            zoom

    };

}


function worldToScreen(worldX, worldY) {

    return {

        x:
            worldX * zoom +
            viewOffsetX,

        y:
            worldY * zoom +
            viewOffsetY

    };

}


// ============================================================
// Mouse position
// ============================================================

function getMousePosition(event) {

    const rect =
        canvas.getBoundingClientRect();


    // Position inside the browser viewport

    const screenX =
        event.clientX - rect.left;

    const screenY =
        event.clientY - rect.top;


    // Convert screen position
    // into infinite-world position

    return {

        x:
            (screenX - viewOffsetX) /
            zoom,

        y:
            (screenY - viewOffsetY) /
            zoom

    };

}



// ============================================================
// Tool selection
// ============================================================

toolButtons.forEach(button => {

    button.addEventListener(
        "click",
        () => {

            currentTool =
                button.dataset.tool;
            lastSelectClick = null;

            updateActiveTool();

            if (
                currentTool !== "select"
            ) {

                selectedElement = null;
                selectedElements = [];

                render();

            }

            toolsMenu.hidden = true;
            moreToolsButton.setAttribute("aria-expanded", "false");

        }
    );

});

moreToolsButton.addEventListener("click", () => {
    toolsMenu.hidden = !toolsMenu.hidden;
    moreToolsButton.setAttribute("aria-expanded", String(!toolsMenu.hidden));
});

toolsMenu.addEventListener("click", () => {
    toolsMenu.hidden = true;
    moreToolsButton.setAttribute("aria-expanded", "false");
});

toolsMenu.hidden = false;
moreToolsButton.setAttribute("aria-expanded", "true");

lockToggle.addEventListener("click", () => {
    isLocked = !isLocked;
    lockToggle.setAttribute("aria-pressed", String(isLocked));
    lockToggle.setAttribute("title", isLocked ? "Unlock canvas" : "Lock canvas");
    lockToggle.setAttribute("aria-label", isLocked ? "Unlock canvas" : "Lock canvas");
    lockToggle.classList.toggle("active", isLocked);
});

document.querySelector('[data-action="insert-image"]').addEventListener("click", () => {
    toolsMenu.hidden = true;
    moreToolsButton.setAttribute("aria-expanded", "false");
    if (isLocked) {
        return;
    }
    imagePicker.click();
});

imagePicker.addEventListener("change", () => {
    const file = imagePicker.files && imagePicker.files[0];
    imagePicker.value = "";
    if (!file || isLocked) {
        return;
    }

    const reader = new FileReader();
    reader.onerror = () => console.error("Unable to read the selected image.");
    reader.onload = () => {
        const image = new Image();
        image.onerror = () => console.error("The selected file is not a supported image.");
        image.onload = () => {
            const scale = Math.min(1, 480 / image.naturalWidth, 360 / image.naturalHeight);
            const point = screenToWorld(canvasWidth / 2, canvasHeight / 2);
            const element = {
                id: generateId(),
                type: "image",
                src: reader.result,
                x: point.x - image.naturalWidth * scale / 2,
                y: point.y - image.naturalHeight * scale / 2,
                width: image.naturalWidth * scale,
                height: image.naturalHeight * scale
            };
            saveHistory();
            elements.push(element);
            saveToLocalStorage();
            render();
        };
        image.src = reader.result;
    };
    reader.readAsDataURL(file);
});

document.querySelector('[data-action="web-embed"]').addEventListener("click", () => {
    toolsMenu.hidden = true;
    moreToolsButton.setAttribute("aria-expanded", "false");
    if (isLocked) {
        return;
    }
    embedDialog.hidden = false;
    embedUrlInput.focus();
});

document.getElementById("cancel-embed").addEventListener("click", () => {
    embedDialog.hidden = true;
    embedForm.reset();
});

embedUrlInput.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        embedDialog.hidden = true;
        embedForm.reset();
    }
});

embedForm.addEventListener("submit", event => {
    event.preventDefault();
    const url = new URL(embedUrlInput.value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        embedUrlInput.setCustomValidity("Use an http or https web address.");
        embedUrlInput.reportValidity();
        return;
    }

    const point = screenToWorld(canvasWidth / 2, canvasHeight / 2);
    saveHistory();
    elements.push({
        id: generateId(),
        type: "embed",
        url: url.href,
        x: point.x - 160,
        y: point.y - 90,
        width: 320,
        height: 180
    });
    embedDialog.hidden = true;
    embedForm.reset();
    saveToLocalStorage();
    render();
});

embedUrlInput.addEventListener("input", () => embedUrlInput.setCustomValidity(""));

document.querySelector('[data-action="draw-to-shape"]').addEventListener("click", convertDrawingToShape);
document.querySelector('[data-action="undo"]').addEventListener("click", undo);
document.querySelector('[data-action="redo"]').addEventListener("click", redo);

canvas.addEventListener("dblclick", event => {
    const point = getMousePosition(event);
    const element = findElementAt(point.x, point.y);
    if (element && element.type === "embed") {
        activeEmbedId = element.id;
        renderEmbedOverlays();
    }
});

function updateActiveTool() {

    toolButtons.forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.tool === currentTool
        );

    });

    updateCanvasCursor();
    updateStylePanel();

}

function getStyleTargets() {
    return selectedElements.length
        ? selectedElements
        : selectedElement
            ? [selectedElement]
            : [];
}

function setStyleProperty(property, value) {
    const targets = getStyleTargets();
    if (!targets.length) {
        defaultStyle[property] = value;
    }
    else {
        saveHistory();
        targets.forEach(element => {
            element[property] = value;
        });
    }
    if (property === "fill") {
        currentFillColor = value;
        const fillMode = value === "transparent" ? "none" : "solid";
        if (!targets.length) {
            defaultStyle.fillMode = fillMode;
        }
        else {
            targets.forEach(element => {
                element.fillMode = fillMode;
            });
        }
    }

    if (activeTextEditor && (!targets.length || targets.includes(activeTextEditor.textElement))) {
        activeTextEditor.textElement[property] = value;
        if (property === "textColor") {
            activeTextEditor.input.style.color = value;
        }
    }

    saveToLocalStorage();
    render();
}

function updateStylePanel() {
    const target = getStyleTargets()[0];
    const itemType = target ? target.type : currentTool;
    const styleGroups = {
        rectangle: ["stroke", "background", "fill", "stroke-width", "stroke-style", "sloppiness", "edges", "opacity", "layers"],
        diamond: ["stroke", "background", "fill", "stroke-width", "stroke-style", "sloppiness", "opacity", "layers"],
        ellipse: ["stroke", "background", "fill", "stroke-width", "stroke-style", "sloppiness", "opacity", "layers"],
        frame: ["stroke", "stroke-width", "opacity", "layers"],
        arrow: ["stroke", "stroke-width", "stroke-style", "sloppiness", "arrow-type", "arrowheads", "opacity", "layers"],
        line: ["stroke", "stroke-width", "stroke-style", "sloppiness", "opacity", "layers"],
        pen: ["stroke", "stroke-width", "opacity"],
        text: ["text-color", "background", "font-family", "font-size", "text-align", "opacity", "layers"],
        note: ["text-color", "background", "font-family", "font-size", "text-align", "opacity", "layers"],
        bucket: ["background"],
        image: ["opacity", "layers"],
        embed: ["opacity", "layers"]
    };
    const visibleGroups = styleGroups[itemType] || [];
    stylePanel.hidden = visibleGroups.length === 0;
    stylePanel.querySelectorAll("[data-style-group]").forEach(section => {
        section.hidden = !visibleGroups.includes(section.dataset.styleGroup);
    });

    const style = target
        ? {
            ...defaultStyle,
            ...target,
            stroke: target.stroke || defaultStyle.stroke,
            textColor: target.textColor || (
                target.type === "note"
                    ? DEFAULT_TEXT_COLOR
                    : target.stroke || defaultStyle.textColor
            ),
            fill: target.fill || "transparent",
            fillMode: target.fillMode || (target.fill && target.fill !== "transparent" ? "solid" : "none"),
            lineWidth: target.lineWidth || DEFAULT_LINE_WIDTH,
            strokeDash: target.strokeDash || "solid",
            roughness: target.roughness ?? 1,
            cornerStyle: target.cornerStyle || "sharp",
            arrowType: target.arrowType || "straight",
            arrowHeads: target.arrowHeads || "end",
            fontFamily: target.fontFamily || HANDWRITING_FONT,
            fontSize: target.fontSize || (target.type === "note" ? 20 : 24),
            textAlign: target.textAlign || (target.type === "note" ? "center" : "left"),
            opacity: target.opacity ?? 1
        }
        : defaultStyle;
    stylePanel.querySelectorAll("[data-style-property]").forEach(button => {
        const property = button.dataset.styleProperty;
        const value = property === "fontSize"
            ? Number(button.dataset.styleValue)
            : ["lineWidth", "roughness"].includes(property)
                ? Number(button.dataset.styleValue)
                : button.dataset.styleValue;
        let actualValue = style[property];
        if (property === "textColor" && target && !target.textColor) {
            actualValue = target.type === "note"
                ? DEFAULT_TEXT_COLOR
                : target.stroke || defaultStyle.textColor;
        }
        button.classList.toggle("active", actualValue === value);
    });

    const opacity = Number.isFinite(style.opacity) ? style.opacity : 1;
    opacityControl.value = String(Math.round(opacity * 100));
    opacityValue.value = opacityControl.value;
    opacityValue.textContent = opacityControl.value;
}

stylePanel.addEventListener("click", event => {
    const propertyButton = event.target.closest("[data-style-property]");
    if (propertyButton) {
        const property = propertyButton.dataset.styleProperty;
        const value = ["fontSize", "lineWidth", "roughness"].includes(property)
            ? Number(propertyButton.dataset.styleValue)
            : propertyButton.dataset.styleValue;
        setStyleProperty(property, value);
        return;
    }

    const layerButton = event.target.closest("[data-layer-action]");
    if (layerButton) {
        moveSelectedLayers(layerButton.dataset.layerAction);
    }
});

opacityControl.addEventListener("input", () => {
    opacityValue.value = opacityControl.value;
    opacityValue.textContent = opacityControl.value;
});

opacityControl.addEventListener("change", () => {
    setStyleProperty("opacity", Number(opacityControl.value) / 100);
});

function moveSelectedLayers(action) {
    const targets = getStyleTargets();
    if (!targets.length) {
        return;
    }

    saveHistory();
    const selectedIds = new Set(targets.map(element => element.id));
    const nextElements = [...elements];
    if (action === "back") {
        const moving = nextElements.filter(element => selectedIds.has(element.id));
        elements = [
            ...moving,
            ...nextElements.filter(element => !selectedIds.has(element.id))
        ];
    }
    else if (action === "front") {
        const moving = nextElements.filter(element => selectedIds.has(element.id));
        elements = [
            ...nextElements.filter(element => !selectedIds.has(element.id)),
            ...moving
        ];
    }
    else if (action === "backward") {
        for (let index = 1; index < nextElements.length; index++) {
            if (selectedIds.has(nextElements[index].id) && !selectedIds.has(nextElements[index - 1].id)) {
                [nextElements[index - 1], nextElements[index]] = [nextElements[index], nextElements[index - 1]];
            }
        }
        elements = nextElements;
    }
    else if (action === "forward") {
        for (let index = nextElements.length - 2; index >= 0; index--) {
            if (selectedIds.has(nextElements[index].id) && !selectedIds.has(nextElements[index + 1].id)) {
                [nextElements[index], nextElements[index + 1]] = [nextElements[index + 1], nextElements[index]];
            }
        }
        elements = nextElements;
    }
    else {
        return;
    }

    saveToLocalStorage();
    render();
}


function updateCanvasCursor() {

    if (isPanning) {
        canvas.style.cursor = "grabbing";
    }
    else if (currentTool === "eraser") {
        canvas.style.cursor = "crosshair";
    }
    else if (currentTool === "remove") {
        canvas.style.cursor = "not-allowed";
    }
    else if (currentTool === "select") {
        canvas.style.cursor = "default";
    }
    else if (isSpacePressed || currentTool === "pan") {
        canvas.style.cursor = "grab";
    }
    else {
        canvas.style.cursor = "default";
    }

}

function convertDrawingToShape() {
    if (isLocked) {
        return;
    }
    const drawing = selectedElement && selectedElement.type === "pen"
        ? selectedElement
        : [...elements].reverse().find(element => element.type === "pen");
    if (!drawing || drawing.points.length < 3) {
        return;
    }

    const bounds = getElementBounds(drawing);
    if (bounds.width < 3 || bounds.height < 3) {
        return;
    }

    const first = drawing.points[0];
    const last = drawing.points[drawing.points.length - 1];
    const closed = Math.hypot(first.x - last.x, first.y - last.y) < Math.max(bounds.width, bounds.height) * 0.2;
    const lineDistance = Math.abs(
        (last.y - first.y) * drawing.points[Math.floor(drawing.points.length / 2)].x -
        (last.x - first.x) * drawing.points[Math.floor(drawing.points.length / 2)].y +
        last.x * first.y - last.y * first.x
    ) / Math.max(1, Math.hypot(last.x - first.x, last.y - first.y));

    saveHistory();
    if (closed) {
        drawing.type = "ellipse";
        drawing.x = bounds.x;
        drawing.y = bounds.y;
        drawing.width = bounds.width;
        drawing.height = bounds.height;
        delete drawing.points;
    }
    else if (lineDistance < Math.max(bounds.width, bounds.height) * 0.08) {
        drawing.type = "line";
        drawing.x = first.x;
        drawing.y = first.y;
        drawing.endX = last.x;
        drawing.endY = last.y;
        delete drawing.points;
    }
    else {
        drawing.type = "rectangle";
        drawing.x = bounds.x;
        drawing.y = bounds.y;
        drawing.width = bounds.width;
        drawing.height = bounds.height;
        delete drawing.points;
    }

    selectedElement = drawing;
    selectedElements = [drawing];
    saveToLocalStorage();
    render();
}


updateActiveTool();


// ============================================================
// Element creation
// ============================================================

function createElement(
    type,
    x,
    y,
    width = 0,
    height = 0
) {

    return {

        id: generateId(),

        type,

        x,

        y,

        width,

        height,

        stroke: defaultStyle.stroke,

        textColor: defaultStyle.textColor,

        fill: defaultStyle.fill || DEFAULT_FILL,

        lineWidth: defaultStyle.lineWidth || DEFAULT_LINE_WIDTH,

        fillMode: defaultStyle.fillMode || "solid",

        strokeDash: defaultStyle.strokeDash || "solid",

        roughness: defaultStyle.roughness || 1,

        cornerStyle: defaultStyle.cornerStyle || "sharp",

        arrowType: defaultStyle.arrowType || "curved",

        arrowHeads: defaultStyle.arrowHeads || "end",

        fontFamily: defaultStyle.fontFamily,

        fontSize: defaultStyle.fontSize,

        textAlign: defaultStyle.textAlign,

        opacity: defaultStyle.opacity,

        points: []

    };

}


function strokeMarkerPath(element, points, closed = false) {

    if (points.length < 2) {
        return;
    }

    const pathPoints = [];
    let distanceAlongPath = 0;
    const segmentCount = closed ? points.length : points.length - 1;
    for (let i = 0; i < segmentCount; i++) {
        const start = points[i];
        const end = points[(i + 1) % points.length];
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const steps = Math.max(1, Math.ceil(length / 7));
        for (let step = 0; step < steps; step++) {
            const t = step / steps;
            pathPoints.push({
                x: start.x + (end.x - start.x) * t,
                y: start.y + (end.y - start.y) * t,
                distance: distanceAlongPath + length * t
            });
        }
        distanceAlongPath += length;
    }
    if (!closed) {
        const last = points[points.length - 1];
        pathPoints.push({ ...last, distance: distanceAlongPath });
    }

    let seed = 0;
    for (const character of String(element.id || "marker")) {
        seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
    }
    const phase = (seed % 1000) / 1000 * Math.PI * 2;
    const roughPoints = pathPoints.map((point, index) => {
        const previous = closed || index > 0
            ? pathPoints[(index - 1 + pathPoints.length) % pathPoints.length]
            : point;
        const next = closed || index < pathPoints.length - 1
            ? pathPoints[(index + 1) % pathPoints.length]
            : point;
        const dx = next.x - previous.x;
        const dy = next.y - previous.y;
        const length = Math.hypot(dx, dy) || 1;
        const wobble =
            Math.sin(point.distance * 0.13 + phase) * 0.8 +
            Math.sin(point.distance * 0.047 + phase * 1.7) * 0.45;
        const roughness = Number.isFinite(element.roughness) ? element.roughness : 1;
        return {
            x: point.x - dy / length * wobble * roughness,
            y: point.y + dx / length * wobble * roughness
        };
    });

    ctx.beginPath();
    ctx.moveTo(roughPoints[0].x, roughPoints[0].y);
    for (let i = 1; i < roughPoints.length; i++) {
        ctx.lineTo(roughPoints[i].x, roughPoints[i].y);
    }
    if (closed) {
        ctx.closePath();
    }
    ctx.strokeStyle = element.stroke || DEFAULT_STROKE;
    ctx.lineWidth = element.lineWidth || DEFAULT_LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(getStrokeDash(element));
    ctx.stroke();
    ctx.setLineDash([]);
}

function getStrokeDash(element) {
    const lineWidth = element.lineWidth || DEFAULT_LINE_WIDTH;
    if (element.strokeDash === "dashed") {
        return [lineWidth * 4, lineWidth * 3];
    }
    if (element.strokeDash === "dotted") {
        return [0, lineWidth * 3];
    }
    return [];
}

function fillShape(element, drawPath) {
    if (!element.fill || element.fill === "transparent" || element.fillMode === "none") {
        return;
    }

    ctx.save();
    ctx.fillStyle = element.fill;
    drawPath();
    ctx.fill();

    if (element.fillMode === "hachure") {
        const bounds = getElementBounds(element);
        const baseAlpha = ctx.globalAlpha;
        ctx.save();
        drawPath();
        ctx.clip();
        ctx.globalAlpha = baseAlpha * 0.35;
        ctx.strokeStyle = element.fill;
        ctx.lineWidth = 1;
        const spacing = 8;
        for (let offset = -bounds.height; offset < bounds.width; offset += spacing) {
            ctx.beginPath();
            ctx.moveTo(bounds.x + offset, bounds.y + bounds.height);
            ctx.lineTo(bounds.x + offset + bounds.height, bounds.y);
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
}

function getRectangleOutlinePoints(element) {
    if (element.cornerStyle !== "rounded") {
        return [
            { x: element.x, y: element.y },
            { x: element.x + element.width, y: element.y },
            { x: element.x + element.width, y: element.y + element.height },
            { x: element.x, y: element.y + element.height }
        ];
    }

    const radius = Math.min(12, Math.abs(element.width) / 4, Math.abs(element.height) / 4);
    const corners = [
        { x: element.x + element.width - radius, y: element.y + radius, start: -Math.PI / 2 },
        { x: element.x + element.width - radius, y: element.y + element.height - radius, start: 0 },
        { x: element.x + radius, y: element.y + element.height - radius, start: Math.PI / 2 },
        { x: element.x + radius, y: element.y + radius, start: Math.PI }
    ];
    return corners.flatMap(corner =>
        Array.from({ length: 7 }, (_, index) => {
            const angle = corner.start + index / 6 * Math.PI / 2;
            return {
                x: corner.x + Math.cos(angle) * radius,
                y: corner.y + Math.sin(angle) * radius
            };
        })
    );
}


// ============================================================
// Rectangle
// ============================================================

function drawRectangle(element) {
    const points = getRectangleOutlinePoints(element);
    fillShape(element, () => {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
        ctx.closePath();
    });
    strokeMarkerPath(element, points, true);

}


// ============================================================
// Ellipse
// ============================================================

function drawEllipse(element) {

    const centerX =
        element.x +
        element.width / 2;

    const centerY =
        element.y +
        element.height / 2;

    const radiusX =
        Math.abs(element.width / 2);

    const radiusY =
        Math.abs(element.height / 2);

    fillShape(element, () => {
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    });

    const ellipsePoints = Array.from({ length: 64 }, (_, index) => {
        const angle = index / 64 * Math.PI * 2;
        return {
            x: centerX + Math.cos(angle) * radiusX,
            y: centerY + Math.sin(angle) * radiusY
        };
    });
    strokeMarkerPath(element, ellipsePoints, true);

}


// ============================================================
// Diamond
// ============================================================

function drawDiamond(element) {

    const centerX =
        element.x +
        element.width / 2;

    const centerY =
        element.y +
        element.height / 2;

    fillShape(element, () => {
        ctx.beginPath();
        ctx.moveTo(centerX, element.y);
        ctx.lineTo(element.x + element.width, centerY);
        ctx.lineTo(centerX, element.y + element.height);
        ctx.lineTo(element.x, centerY);
        ctx.closePath();
    });

    strokeMarkerPath(element, [
        { x: centerX, y: element.y },
        { x: element.x + element.width, y: centerY },
        { x: centerX, y: element.y + element.height },
        { x: element.x, y: centerY }
    ], true);

}


// ============================================================
// Line
// ============================================================

function drawLine(element) {

    strokeMarkerPath(element, [
        { x: element.x, y: element.y },
        { x: element.endX, y: element.endY }
    ]);

}


// ============================================================
// Arrow
// ============================================================

function drawArrow(element) {

    const x1 = element.x;
    const y1 = element.y;

    const x2 = element.endX;
    const y2 = element.endY;
    let points;
    if (element.arrowType === "elbow") {
        const middleX = (x1 + x2) / 2;
        points = [
            { x: x1, y: y1 },
            { x: middleX, y: y1 },
            { x: middleX, y: y2 },
            { x: x2, y: y2 }
        ];
    }
    else if (element.arrowType === "curved") {
        const controlX = (x1 + x2) / 2;
        const controlY = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.18;
        points = Array.from({ length: 25 }, (_, index) => {
            const t = index / 24;
            const inverse = 1 - t;
            return {
                x: inverse * inverse * x1 + 2 * inverse * t * controlX + t * t * x2,
                y: inverse * inverse * y1 + 2 * inverse * t * controlY + t * t * y2
            };
        });
    }
    else {
        points = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    }

    strokeMarkerPath(element, points);

    const drawHead = (tip, previous) => {
        const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x);
        const headLength = Math.max(9, (element.lineWidth || DEFAULT_LINE_WIDTH) * 5);
        strokeMarkerPath(element, [
            tip,
            {
                x: tip.x - headLength * Math.cos(angle - Math.PI / 6),
                y: tip.y - headLength * Math.sin(angle - Math.PI / 6)
            }
        ]);
        strokeMarkerPath(element, [
            tip,
            {
                x: tip.x - headLength * Math.cos(angle + Math.PI / 6),
                y: tip.y - headLength * Math.sin(angle + Math.PI / 6)
            }
        ]);
    };

    if (element.arrowHeads !== "none") {
        drawHead(points[points.length - 1], points[points.length - 2]);
    }
    if (element.arrowHeads === "both") {
        drawHead(points[0], points[1]);
    }

}


// ============================================================
// Freehand pen
// ============================================================

function drawFreehand(element) {

    if (
        !element.points ||
        element.points.length < 2
    ) {

        return;

    }

    ctx.strokeStyle =
        element.stroke;

    ctx.lineWidth =
        element.lineWidth;

    ctx.lineCap = "round";

    ctx.lineJoin = "round";
    ctx.setLineDash(getStrokeDash(element));

    ctx.beginPath();
    ctx.moveTo(element.points[0].x, element.points[0].y);
    for (let i = 1; i < element.points.length - 1; i++) {
        const current = element.points[i];
        const next = element.points[i + 1];
        ctx.quadraticCurveTo(
            current.x,
            current.y,
            (current.x + next.x) / 2,
            (current.y + next.y) / 2
        );
    }
    const last = element.points[element.points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.setLineDash([]);

}


// ============================================================
// Text
// ============================================================

function drawText(element) {

    ctx.fillStyle =
        element.textColor || element.stroke || DEFAULT_STROKE;

    const lines = getTextLines(element);
    const lineHeight = (element.fontSize || 24) * 1.3;
    if (element.fill && element.fill !== "transparent" && element.fillMode !== "none") {
        const bounds = getElementBounds({
            ...element,
            height: Math.max(lineHeight, lines.length * lineHeight)
        });
        fillShape(element, () => {
            ctx.beginPath();
            ctx.rect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);
        });
    }

    ctx.font =
        `${element.fontSize || 24}px ${element.fontFamily || HANDWRITING_FONT}`;

    ctx.textBaseline =
        "top";
    ctx.textAlign = element.textAlign || "left";

    lines.forEach((line, index) => {
        const x = element.x + (
            element.textAlign === "center"
                ? (element.width || 0) / 2
                : element.textAlign === "right"
                    ? (element.width || 0)
                    : 0
        );
        ctx.fillText(
            line,
            x,
            element.y + index * lineHeight
        );
    });
    ctx.textAlign = "start";

}

function drawNote(element) {
    ctx.fillStyle = element.fill || "#ffdf66";
    ctx.strokeStyle = element.stroke || "#e1c956";
    ctx.lineWidth = element.lineWidth || 1;
    ctx.beginPath();
    ctx.roundRect(element.x, element.y, element.width, element.height, 16);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(element.x + 14, element.y + 10, element.width - 28, element.height - 48);
    ctx.clip();
    ctx.fillStyle = element.textColor || DEFAULT_TEXT_COLOR;
    ctx.font = `${element.fontSize || 20}px ${element.fontFamily || HANDWRITING_FONT}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = element.textAlign || "center";
    const lines = getTextLines({ ...element, width: Math.max(1, element.width - 32) });
    const lineHeight = (element.fontSize || 20) * 1.3;
    const textHeight = lines.length * lineHeight;
    const textTop = element.y + Math.max(12, (element.height - 32 - textHeight) / 2);
    const textX = element.textAlign === "left"
        ? element.x + 24
        : element.textAlign === "right"
            ? element.x + element.width - 24
            : element.x + element.width / 2;
    lines.forEach((line, index) => {
        ctx.fillText(line, textX, textTop + index * lineHeight + lineHeight / 2);
    });
    ctx.restore();

    ctx.fillStyle = "#514c3e";
    ctx.font = "16px sans-serif";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";
    const date = new Date(element.createdAt || Date.now()).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short"
    });
    ctx.fillText(date, element.x + element.width - 20, element.y + element.height - 18);
    ctx.textAlign = "start";

}

function drawFrame(element) {
    ctx.save();
    ctx.strokeStyle = element.stroke || "#999";
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([8 / zoom, 5 / zoom]);
    ctx.strokeRect(element.x, element.y, element.width, element.height);
    ctx.setLineDash([]);
    ctx.fillStyle = "#666";
    ctx.font = `${12 / zoom}px sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.fillText(element.label || "Frame", element.x + 4 / zoom, element.y - 4 / zoom);
    ctx.restore();

}

function drawImageElement(element) {
    let image = loadedImages.get(element.id);
    if (!image) {
        image = new Image();
        loadedImages.set(element.id, image);
        image.onload = render;
        image.onerror = () => console.error("Unable to load whiteboard image:", element.src);
        image.src = element.src;
    }
    if (image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, element.x, element.y, element.width, element.height);
    }
}

function drawEmbed(element) {
    ctx.fillStyle = "#fafafa";
    ctx.strokeStyle = "#d8d8d8";
    ctx.lineWidth = 1;
    ctx.fillRect(element.x, element.y, element.width, element.height);
    ctx.strokeRect(element.x, element.y, element.width, element.height);
    ctx.fillStyle = "#6965db";
    ctx.font = "14px sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("Web Embed", element.x + 14, element.y + 14);
    ctx.fillStyle = "#555";
    ctx.font = "13px sans-serif";
    ctx.fillText(element.url, element.x + 14, element.y + 42, element.width - 28);
    ctx.fillStyle = "#999";
    ctx.font = "12px sans-serif";
    ctx.fillText("Double-click to open", element.x + 14, element.y + element.height - 24);
}

function renderEmbedOverlays() {
    const element = elements.find(item => item.id === activeEmbedId && item.type === "embed");
    if (!element) {
        embedOverlays.forEach(overlay => overlay.remove());
        embedOverlays.clear();
        activeEmbedId = null;
        return;
    }
    embedOverlays.forEach((overlay, id) => {
        if (id !== activeEmbedId) {
            overlay.remove();
            embedOverlays.delete(id);
        }
    });

    let wrapper = embedOverlays.get(element.id);
    if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "embed-overlay";
        const closeButton = document.createElement("button");
        closeButton.className = "embed-close";
        closeButton.type = "button";
        closeButton.setAttribute("aria-label", "Close embedded website");
        closeButton.textContent = "×";
        closeButton.addEventListener("click", event => {
            event.stopPropagation();
            wrapper.remove();
            embedOverlays.delete(element.id);
            activeEmbedId = null;
        });

        const frame = document.createElement("iframe");
        frame.title = "Embedded website";
        frame.loading = "lazy";
        frame.referrerPolicy = "no-referrer";
        frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups");
        frame.src = element.url;
        wrapper.append(closeButton, frame);
        workspace.appendChild(wrapper);
        embedOverlays.set(element.id, wrapper);
    }

    const position = worldToScreen(element.x, element.y);
    const canvasRect = canvas.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();
    wrapper.style.left = `${position.x + canvasRect.left - workspaceRect.left}px`;
    wrapper.style.top = `${position.y + canvasRect.top - workspaceRect.top}px`;
    wrapper.style.width = `${element.width * zoom}px`;
    wrapper.style.height = `${element.height * zoom}px`;
    wrapper.style.opacity = String(element.opacity ?? 1);
}


function getTextLines(element) {

    const paragraphs = (element.text || "").split("\n");
    const maxWidth = element.width || Infinity;
    const lines = [];

    ctx.save();
    ctx.font = `${element.fontSize || 24}px ${element.fontFamily || HANDWRITING_FONT}`;

    paragraphs.forEach(paragraph => {
        const words = paragraph.split(" ");

        if (words.length === 0) {
            lines.push("");
            return;
        }

        let line = words[0];

        for (let i = 1; i < words.length; i++) {
            const candidate = `${line} ${words[i]}`;

            if (
                ctx.measureText(candidate).width <= maxWidth ||
                line.length === 0
            ) {
                line = candidate;
            }
            else {
                lines.push(line);
                line = words[i];
            }
        }

        lines.push(line);
    });

    ctx.restore();
    return lines;

}


// ============================================================
// Draw individual element
// ============================================================

function drawElement(element) {

    ctx.save();
    ctx.globalAlpha *= Number.isFinite(element.opacity) ? element.opacity : 1;

    switch (element.type) {

        case "rectangle":

            drawRectangle(element);

            break;


        case "ellipse":

            drawEllipse(element);

            break;


        case "diamond":

            drawDiamond(element);

            break;


        case "line":

            drawLine(element);

            break;


        case "arrow":

            drawArrow(element);

            break;


        case "pen":

            drawFreehand(element);

            break;


        case "text":

            drawText(element);

            break;

        case "note":

            drawNote(element);

            break;

        case "frame":

            drawFrame(element);

            break;

        case "image":

            drawImageElement(element);

            break;

        case "embed":

            drawEmbed(element);

            break;

    }

    ctx.restore();

}

// ============================================================
// Render everything
// ============================================================

function render() {
    const dpr =
        window.devicePixelRatio || 1;


    // Reset all previous transforms

    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );

    // Clear the visible screen

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    ctx.save();


    // ------------------------------------------------
    // Camera
    // ------------------------------------------------

    ctx.translate(
        viewOffsetX,
        viewOffsetY
    );

    ctx.scale(
        zoom,
        zoom
    );


    // ------------------------------------------------
    // Draw all objects
    // ------------------------------------------------

    for (const element of elements) {

        if (activeTextEditor && element === activeTextEditor.element && element.type !== "note") {
            if (element.type === "text" && element.fill && element.fill !== "transparent") {
                drawText({ ...element, text: "" });
            }
            continue;
        }

        if (activeTextEditor && element === activeTextEditor.element && element.type === "note") {
            drawNote({ ...element, text: "" });
        }
        else {
            drawElement(element);
        }

    }

    if (activeTextEditor && !activeTextEditor.element && activeTextEditor.textElement.type === "note") {
        drawNote({ ...activeTextEditor.textElement, text: "" });
    }

    // ------------------------------------------------
    // Draw preview
    // ------------------------------------------------

    if (previewElement) {

        ctx.save();

        ctx.globalAlpha = 0.7;

        drawElement(previewElement);

        ctx.restore();

    }

    if (currentTool === "lasso" && lassoPoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.beginPath();
        ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
        lassoPoints.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
        ctx.stroke();
        ctx.restore();
    }

    if (isMarqueeSelecting && marqueeStart && marqueeEnd) {
        const bounds = getRectangleFromPoints(
            marqueeStart.x,
            marqueeStart.y,
            marqueeEnd.x,
            marqueeEnd.y
        );
        ctx.save();
        ctx.fillStyle = "rgba(105, 101, 219, 0.08)";
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([4 / zoom, 3 / zoom]);
        ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.restore();
    }

    if (laserPoints.length > 1 && laserExpiresAt > Date.now()) {
        ctx.save();
        ctx.strokeStyle = "#ed3b3b";
        ctx.lineWidth = 4 / zoom;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = Math.min(1, (laserExpiresAt - Date.now()) / 1200);
        ctx.beginPath();
        ctx.moveTo(laserPoints[0].x, laserPoints[0].y);
        laserPoints.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
        ctx.stroke();
        ctx.restore();
    }


    // ------------------------------------------------
    // Selection
    // ------------------------------------------------

    (selectedElements.length ? selectedElements : selectedElement ? [selectedElement] : [])
        .forEach(element => {
            if (selectedElements.length <= 1) {
                drawSelectionBox(element);
            }
            else {
                const bounds = getElementBounds(element);
                ctx.save();
                ctx.strokeStyle = SELECTION_COLOR;
                ctx.lineWidth = 1.5 / zoom;
                ctx.setLineDash([]);
                ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
                ctx.restore();
            }
        });
    if (selectedElements.length > 1) {
        drawSelectionBounds(getSelectionBounds(selectedElements));
    }


    ctx.restore();
    updateTextEditorPosition();
    renderEmbedOverlays();
    updateStylePanel();
    zoomLevel.value = `${Math.round(zoom * 100)}%`;
    zoomLevel.textContent = zoomLevel.value;

}



// ============================================================
// Selection box
// ============================================================

function drawSelectionBox(element) {

    const bounds =
        getElementBounds(element);

    ctx.save();

    ctx.strokeStyle =
        SELECTION_COLOR;

    ctx.lineWidth =
        1.5 / zoom;
    ctx.setLineDash([]);

    ctx.strokeRect(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height
    );

    const handleSize = 8 / zoom;
    const halfHandle = handleSize / 2;
    [
        [bounds.x, bounds.y],
        [bounds.x + bounds.width, bounds.y],
        [bounds.x + bounds.width, bounds.y + bounds.height],
        [bounds.x, bounds.y + bounds.height]
    ].forEach(([x, y]) => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(x - halfHandle, y - halfHandle, handleSize, handleSize);
        ctx.strokeRect(x - halfHandle, y - halfHandle, handleSize, handleSize);
    });

    ctx.restore();

}

function getSelectionBounds(selection) {
    if (!selection.length) {
        return null;
    }
    const bounds = selection.map(getElementBounds);
    const left = Math.min(...bounds.map(item => item.x));
    const top = Math.min(...bounds.map(item => item.y));
    const right = Math.max(...bounds.map(item => item.x + item.width));
    const bottom = Math.max(...bounds.map(item => item.y + item.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
}

function drawSelectionBounds(bounds) {
    if (!bounds) {
        return;
    }
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([3 / zoom, 2 / zoom]);
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    const handleSize = 8 / zoom;
    const halfHandle = handleSize / 2;
    [
        [bounds.x, bounds.y],
        [bounds.x + bounds.width, bounds.y],
        [bounds.x + bounds.width, bounds.y + bounds.height],
        [bounds.x, bounds.y + bounds.height]
    ].forEach(([x, y]) => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(x - halfHandle, y - halfHandle, handleSize, handleSize);
        ctx.strokeRect(x - halfHandle, y - halfHandle, handleSize, handleSize);
    });
    ctx.restore();
}

function getResizeHandleAt(element, x, y) {
    const bounds = getElementBounds(element);
    const tolerance = 9 / zoom;
    const handles = {
        nw: [bounds.x, bounds.y],
        ne: [bounds.x + bounds.width, bounds.y],
        se: [bounds.x + bounds.width, bounds.y + bounds.height],
        sw: [bounds.x, bounds.y + bounds.height]
    };
    return Object.entries(handles).find(([, point]) =>
        Math.abs(point[0] - x) <= tolerance &&
        Math.abs(point[1] - y) <= tolerance
    )?.[0] || null;
}

function resizeSelectedElement(element, original, startBounds, nextBounds) {
    const scaleX = nextBounds.width / Math.max(1, startBounds.width);
    const scaleY = nextBounds.height / Math.max(1, startBounds.height);
    const mapPoint = (value, oldOrigin, oldSize, newOrigin, newSize) =>
        oldSize > 0
            ? newOrigin + (value - oldOrigin) * newSize / oldSize
            : value + newOrigin - oldOrigin;

    if (element.type === "pen") {
        element.points = original.points.map(point => ({
            x: mapPoint(point.x, startBounds.x, startBounds.width, nextBounds.x, nextBounds.width),
            y: mapPoint(point.y, startBounds.y, startBounds.height, nextBounds.y, nextBounds.height)
        }));
        element.x = nextBounds.x;
        element.y = nextBounds.y;
    }
    else if (element.type === "line" || element.type === "arrow") {
        element.x = mapPoint(original.x, startBounds.x, startBounds.width, nextBounds.x, nextBounds.width);
        element.y = mapPoint(original.y, startBounds.y, startBounds.height, nextBounds.y, nextBounds.height);
        element.endX = mapPoint(original.endX, startBounds.x, startBounds.width, nextBounds.x, nextBounds.width);
        element.endY = mapPoint(original.endY, startBounds.y, startBounds.height, nextBounds.y, nextBounds.height);
    }
    else {
        element.x = nextBounds.x;
        element.y = nextBounds.y;
        element.width = nextBounds.width;
        element.height = nextBounds.height;
        if (element.type === "text" || element.type === "note") {
            element.fontSize = Math.max(8, (original.fontSize || (element.type === "note" ? 20 : 24)) *
                Math.min(scaleX, scaleY));
        }
    }
}

function getResizedBounds(handle, start, pointer) {
    const minSize = 12;
    let left = start.x;
    let top = start.y;
    let right = start.x + start.width;
    let bottom = start.y + start.height;

    if (handle.includes("w")) {
        left = Math.min(pointer.x, right - minSize);
    }
    if (handle.includes("e")) {
        right = Math.max(pointer.x, left + minSize);
    }
    if (handle.includes("n")) {
        top = Math.min(pointer.y, bottom - minSize);
    }
    if (handle.includes("s")) {
        bottom = Math.max(pointer.y, top + minSize);
    }

    return { x: left, y: top, width: right - left, height: bottom - top };
}

function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared
        ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
        : 0;
    return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function erasePenAt(element, center, radius) {
    const points = element.points || [];
    if (!points.length) {
        return { touched: false, pieces: [element] };
    }
    if (points.length === 1) {
        const touched = Math.hypot(points[0].x - center.x, points[0].y - center.y) <= radius;
        return { touched, pieces: touched ? [] : [element] };
    }

    const runs = [];
    let currentRun = [];
    let touched = false;
    const flush = () => {
        if (currentRun.length > 1) {
            runs.push(currentRun);
        }
        currentRun = [];
    };
    const interpolate = (a, b, t) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
    });

    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const fx = start.x - center.x;
        const fy = start.y - center.y;
        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - radius * radius;
        let roots = [];

        if (a > 0) {
            const discriminant = b * b - 4 * a * c;
            if (discriminant >= 0) {
                const root = Math.sqrt(discriminant);
                roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
                    .filter(t => t > 0 && t < 1);
            }
        }

        if (distanceToSegment(center, start, end) <= radius) {
            touched = true;
        }

        const stops = [0, ...roots, 1].sort((x, y) => x - y);
        for (let j = 0; j < stops.length - 1; j++) {
            const from = stops[j];
            const to = stops[j + 1];
            const middle = interpolate(start, end, (from + to) / 2);
            const outside = Math.hypot(middle.x - center.x, middle.y - center.y) > radius;
            if (!outside) {
                flush();
                continue;
            }

            const segmentStart = interpolate(start, end, from);
            const segmentEnd = interpolate(start, end, to);
            if (!currentRun.length) {
                currentRun.push(segmentStart);
            }
            else {
                const last = currentRun[currentRun.length - 1];
                if (Math.hypot(last.x - segmentStart.x, last.y - segmentStart.y) > 0.01) {
                    flush();
                    currentRun.push(segmentStart);
                }
            }
            currentRun.push(segmentEnd);
        }
    }
    flush();

    if (!touched) {
        return { touched: false, pieces: [element] };
    }

    const pieces = runs.map((piece, index) => ({
        ...element,
        id: index === 0 ? element.id : generateId(),
        points: piece
    }));
    return { touched: true, pieces };
}

function eraseFreehandAt(point) {
    const radius = 10 / zoom;
    const segmentStart = lastErasePoint || point;
    const distance = Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.35)));
    let nextElements = elements;
    let touched = false;

    for (let step = 1; step <= steps; step++) {
        const center = {
            x: segmentStart.x + (point.x - segmentStart.x) * step / steps,
            y: segmentStart.y + (point.y - segmentStart.y) * step / steps
        };
        const updated = [];
        nextElements.forEach(element => {
            if (element.type !== "pen") {
                updated.push(element);
                return;
            }
            const result = erasePenAt(element, center, radius + (element.lineWidth || 1) / 2);
            if (result.touched) {
                touched = true;
                updated.push(...result.pieces);
            }
            else {
                updated.push(element);
            }
        });
        nextElements = updated;
    }
    lastErasePoint = point;

    if (touched) {
        if (!eraseHistorySaved) {
            saveHistory();
            eraseHistorySaved = true;
        }
        elements = nextElements;
        selectedElements = selectedElements.filter(selected => elements.includes(selected));
        if (selectedElement && !elements.includes(selectedElement)) {
            selectedElement = selectedElements[0] || null;
        }
        saveToLocalStorage();
        render();
    }
}

function removeObjectAt(point) {
    const element = findElementAt(point.x, point.y);
    if (!element) {
        return;
    }
    if (!removeHistorySaved) {
        saveHistory();
        removeHistorySaved = true;
    }
    elements = elements.filter(item => item.id !== element.id);
    selectedElements = selectedElements.filter(item => item.id !== element.id);
    if (selectedElement && selectedElement.id === element.id) {
        selectedElement = selectedElements[0] || null;
    }
    saveToLocalStorage();
    render();
}


// ============================================================
// Get element bounds
// ============================================================

function getElementBounds(element) {

    if (
        element.type === "line" ||
        element.type === "arrow"
    ) {

        const minX =
            Math.min(
                element.x,
                element.endX
            );

        const minY =
            Math.min(
                element.y,
                element.endY
            );

        const maxX =
            Math.max(
                element.x,
                element.endX
            );

        const maxY =
            Math.max(
                element.y,
                element.endY
            );

        return {

            x: minX,

            y: minY,

            width: maxX - minX,

            height: maxY - minY

        };

    }


    if (
        element.type === "pen"
    ) {

        if (
            !element.points ||
            element.points.length === 0
        ) {

            return {
                x: element.x,
                y: element.y,
                width: 0,
                height: 0
            };

        }


        let minX =
            element.points[0].x;

        let maxX =
            element.points[0].x;

        let minY =
            element.points[0].y;

        let maxY =
            element.points[0].y;


        for (
            const point of element.points
        ) {

            minX =
                Math.min(
                    minX,
                    point.x
                );

            maxX =
                Math.max(
                    maxX,
                    point.x
                );

            minY =
                Math.min(
                    minY,
                    point.y
                );

            maxY =
                Math.max(
                    maxY,
                    point.y
                );

        }


        return {

            x: minX,

            y: minY,

            width: maxX - minX,

            height: maxY - minY

        };

    }


    if (element.type === "note") {
        return {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height
        };
    }

    if (
        element.type === "text"
    ) {

        ctx.save();

        ctx.font =
            `${element.fontSize || 24}px ${element.fontFamily || HANDWRITING_FONT}`;

        const width =
            Math.max(
                0,
                ...getTextLines(element).map(
                    line => ctx.measureText(line).width
                )
            );
        const lines = getTextLines(element);

        ctx.restore();

        return {

            x: element.x,

            y: element.y,

            width: element.width || width,

            height:
                Math.max(1, lines.length) *
                (element.fontSize || 24) * 1.3

        };

    }


    return {

        x: element.x,

        y: element.y,

        width:
            Math.abs(element.width),

        height:
            Math.abs(element.height)

    };

}


// ============================================================
// Point inside element
// ============================================================

function isPointInsideElement(
    element,
    x,
    y
) {

    const bounds =
        getElementBounds(element);

    const padding =
        8 / zoom;


    return (
        x >= bounds.x - padding &&
        x <=
            bounds.x +
            bounds.width +
            padding &&
        y >= bounds.y - padding &&
        y <=
            bounds.y +
            bounds.height +
            padding
    );

}


// ============================================================
// Find element under mouse
// ============================================================

function findElementAt(
    x,
    y,
    sourceElements = elements
) {

    // Search backwards because
    // the last element is on top.

    for (
        let i = sourceElements.length - 1;
        i >= 0;
        i--
    ) {

        const element =
            sourceElements[i];

        if (
            isPointInsideElement(
                element,
                x,
                y
            )
        ) {

            return element;

        }

    }

    return null;

}

function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
            point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
        if (intersects) {
            inside = !inside;
        }
    }
    return inside;
}

function rectanglesIntersect(first, second) {
    return first.x <= second.x + second.width &&
        first.x + first.width >= second.x &&
        first.y <= second.y + second.height &&
        first.y + first.height >= second.y;
}

function segmentsIntersect(a, b, c, d) {
    const cross = (first, second, third) =>
        (second.x - first.x) * (third.y - first.y) -
        (second.y - first.y) * (third.x - first.x);
    const firstSide = cross(a, b, c);
    const secondSide = cross(a, b, d);
    const thirdSide = cross(c, d, a);
    const fourthSide = cross(c, d, b);
    return firstSide * secondSide <= 0 && thirdSide * fourthSide <= 0;
}

function isElementInsideLasso(element, polygon) {
    const bounds = getElementBounds(element);
    const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height }
    ];
    if (corners.some(point => isPointInPolygon(point, polygon))) {
        return true;
    }

    const lassoBounds = {
        x: Math.min(...polygon.map(point => point.x)),
        y: Math.min(...polygon.map(point => point.y)),
        width: Math.max(...polygon.map(point => point.x)) - Math.min(...polygon.map(point => point.x)),
        height: Math.max(...polygon.map(point => point.y)) - Math.min(...polygon.map(point => point.y))
    };
    if (!rectanglesIntersect(bounds, lassoBounds)) {
        return false;
    }
    const rectEdges = corners.map((point, index) => [
        point,
        corners[(index + 1) % corners.length]
    ]);
    for (let index = 0; index < polygon.length; index++) {
        const start = polygon[index];
        const end = polygon[(index + 1) % polygon.length];
        if (rectEdges.some(([a, b]) => segmentsIntersect(start, end, a, b))) {
            return true;
        }
    }
    return polygon.some(point =>
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
    ) || isPointInPolygon({
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2
    }, polygon);
}


// ============================================================
// Save state to undo history
// ============================================================

function saveHistory() {

    undoStack.push(
        JSON.stringify(elements)
    );

    // Prevent unlimited memory growth
    if (
        undoStack.length > 50
    ) {

        undoStack.shift();

    }

    redoStack = [];

}


// ============================================================
// Undo
// ============================================================

function undo() {

    if (
        undoStack.length === 0
    ) {

        return;

    }


    redoStack.push(
        JSON.stringify(elements)
    );


    const previous =
        undoStack.pop();


    elements =
        JSON.parse(previous);


    selectedElement = null;
    selectedElements = [];

    saveToLocalStorage();

    render();

}


// ============================================================
// Redo
// ============================================================

function redo() {

    if (
        redoStack.length === 0
    ) {

        return;

    }


    undoStack.push(
        JSON.stringify(elements)
    );


    const next =
        redoStack.pop();


    elements =
        JSON.parse(next);


    selectedElement = null;
    selectedElements = [];

    saveToLocalStorage();

    render();

}


// ============================================================
// Undo / Redo buttons
// ============================================================

if (undoButton) {

    undoButton.addEventListener(
        "click",
        undo
    );

}


if (redoButton) {

    redoButton.addEventListener(
        "click",
        redo
    );

}


// ============================================================
// Create normalized rectangle
// ============================================================

function getRectangleFromPoints(
    x1,
    y1,
    x2,
    y2
) {

    return {

        x: Math.min(x1, x2),

        y: Math.min(y1, y2),

        width:
            Math.abs(x2 - x1),

        height:
            Math.abs(y2 - y1)

    };

}


// ============================================================
// Mouse Down
// ============================================================

canvas.addEventListener(
    "mousedown",
    event => {

        suppressNextCanvasClick = false;

        const mouse =
            getMousePosition(event);

        lastMouseX = event.clientX;
        lastMouseY = event.clientY;

        // ========================================
        // PAN
        // ========================================

        if (
            event.button === 1 ||
            isSpacePressed ||
            currentTool === "pan"
        ) {

            isPanning = true;
            panStartX = event.clientX - viewOffsetX;
            panStartY = event.clientY - viewOffsetY;
            updateCanvasCursor();
            event.preventDefault();
            return;
        }


        if (event.button !== 0) {
            return;
        }

        if (isLocked) {
            return;
        }

        if (currentTool === "text" || currentTool === "note") {
            return;
        }

        if (currentTool === "eraser") {
            isErasing = true;
            eraseHistorySaved = false;
            lastErasePoint = null;
            eraseFreehandAt(mouse);
            event.preventDefault();
            return;
        }

        if (currentTool === "remove") {
            isRemoving = true;
            removeHistorySaved = false;
            removeObjectAt(mouse);
            event.preventDefault();
            return;
        }

        if (currentTool === "bucket") {
            const element = findElementAt(mouse.x, mouse.y);
            if (element && ["rectangle", "ellipse", "diamond", "frame", "note"].includes(element.type)) {
                saveHistory();
                element.fill = currentFillColor;
                element.fillMode = "solid";
                selectedElement = element;
                selectedElements = [element];
                saveToLocalStorage();
                render();
            }
            return;
        }

        // ========================================
        // SELECT
        // ========================================

        if (currentTool === "select") {
            const elapsedSinceClick = lastSelectClick
                ? Date.now() - lastSelectClick.time
                : Infinity;
            const distanceFromClick = lastSelectClick
                ? Math.hypot(
                    event.clientX - lastSelectClick.clientX,
                    event.clientY - lastSelectClick.clientY
                )
                : Infinity;
            if (
                !findElementAt(mouse.x, mouse.y) &&
                elapsedSinceClick <= 450 &&
                distanceFromClick <= 8
            ) {
                lastSelectClick = null;
                isMarqueeSelecting = true;
                marqueeStart = mouse;
                marqueeEnd = mouse;
                if (!event.shiftKey) {
                    selectedElement = null;
                    selectedElements = [];
                }
                event.preventDefault();
                render();
                return;
            }

            const selection = selectedElements.length
                ? selectedElements
                : selectedElement
                    ? [selectedElement]
                    : [];
            const selectionBounds = getSelectionBounds(selection);
            const handle = selectionBounds
                ? getResizeHandleAt({ ...selection[0], ...selectionBounds }, mouse.x, mouse.y)
                : null;
            if (handle && selection.length > 1) {
                selectedElement = selection[0];
                selectedElements = [...selection];
                isResizing = true;
                resizeElement = null;
                resizeHandle = handle;
                resizeStartBounds = selectionBounds;
                resizeStartPointer = mouse;
                resizeGroupOriginals = selection.map(element => ({
                    element,
                    original: JSON.parse(JSON.stringify(element)),
                    bounds: getElementBounds(element)
                }));
                saveHistory();
                event.preventDefault();
                render();
                return;
            }
            if (handle && selection.length === 1) {
                const selected = selection[0];
                selectedElement = selected;
                selectedElements = [selected];
                isResizing = true;
                resizeElement = selected;
                resizeHandle = handle;
                resizeStartBounds = getElementBounds(selected);
                resizeStartPointer = mouse;
                resizeOriginalElement = JSON.parse(JSON.stringify(selected));
                saveHistory();
                event.preventDefault();
                render();
                return;
            }

            const element =
                findElementAt(mouse.x, mouse.y);

            if (element) {
                if (event.shiftKey) {
                    const nextSelection = selection.includes(element)
                        ? selection.filter(item => item !== element)
                        : [...selection, element];
                    selectedElements = nextSelection;
                    selectedElement = nextSelection[nextSelection.length - 1] || null;
                    render();
                    event.preventDefault();
                    return;
                }
                if (!selectedElements.includes(element)) {
                    selectedElements = [element];
                }
                selectedElement = element;
                isDragging = true;
                draggedElement = element;
                draggedElements = selectedElements.length > 1 && selectedElements.includes(element)
                    ? [...selectedElements]
                    : [element];
                dragOffsetX = mouse.x - element.x;
                dragOffsetY = mouse.y - element.y;
                lastMouseWorldX = mouse.x;
                lastMouseWorldY = mouse.y;
                saveHistory();
            }
            else {
                if (!event.shiftKey) {
                    selectedElement = null;
                    selectedElements = [];
                }
            }

            render();
            return;
        }

        if (currentTool === "lasso") {
            isDrawing = true;
            lassoPoints = [mouse];
            selectedElement = null;
            selectedElements = [];
            render();
            return;
        }

        if (isMarqueeSelecting && marqueeStart) {
            marqueeEnd = mouse;
            render();
            return;
        }

        if (currentTool === "laser") {
            isDrawing = true;
            if (laserTimeout) {
                clearTimeout(laserTimeout);
                laserTimeout = null;
            }
            laserPoints = [mouse];
            laserExpiresAt = 0;
            render();
            return;
        }
        // ========================================
        // DRAWING
        // ========================================

        isDrawing = true;

        startX = mouse.x;
        startY = mouse.y;

        currentX = mouse.x;
        currentY = mouse.y;


        // ========================================
        // PEN
        // ========================================

        if (currentTool === "pen") {

            previewElement = {

                id: generateId(),

                type: "pen",

                x: mouse.x,

                y: mouse.y,

                points: [
                    {
                        x: mouse.x,
                        y: mouse.y
                    }
                ],

                stroke:
                    defaultStyle.stroke,

                lineWidth:
                    defaultStyle.lineWidth || PEN_LINE_WIDTH,

                opacity:
                    defaultStyle.opacity,

                strokeDash:
                    defaultStyle.strokeDash,

                roughness:
                    defaultStyle.roughness

            };

            return;
        }


        // ========================================
        // LINE
        // ========================================

        if (currentTool === "line") {

            previewElement = {

                id: generateId(),

                type: "line",

                x: mouse.x,

                y: mouse.y,

                endX: mouse.x,

                endY: mouse.y,

                stroke:
                    defaultStyle.stroke,

                lineWidth:
                    defaultStyle.lineWidth || DEFAULT_LINE_WIDTH,

                strokeDash:
                    defaultStyle.strokeDash,

                roughness:
                    defaultStyle.roughness,

                opacity:
                    defaultStyle.opacity

            };

            return;
        }


        // ========================================
        // ARROW
        // ========================================

        if (currentTool === "arrow") {

            previewElement = {

                id: generateId(),

                type: "arrow",

                x: mouse.x,

                y: mouse.y,

                endX: mouse.x,

                endY: mouse.y,

                stroke:
                    defaultStyle.stroke,

                lineWidth:
                    defaultStyle.lineWidth || DEFAULT_LINE_WIDTH,

                strokeDash:
                    defaultStyle.strokeDash,

                roughness:
                    defaultStyle.roughness,

                arrowType:
                    defaultStyle.arrowType,

                arrowHeads:
                    defaultStyle.arrowHeads,

                opacity:
                    defaultStyle.opacity

            };

            return;
        }


        // ========================================
        // SHAPES
        // ========================================

        if (
            currentTool === "rectangle" ||
            currentTool === "ellipse" ||
            currentTool === "diamond" ||
            currentTool === "frame" ||
            currentTool === "note"
        ) {

            previewElement =
                createElement(
                    currentTool,
                    mouse.x,
                    mouse.y,
                    0,
                    0
                );
            if (currentTool === "note") {
                previewElement.fill = "#ffdf66";
                previewElement.stroke = "#d7c77b";
                previewElement.fontSize = 20;
            }
            if (currentTool === "frame") {
                previewElement.stroke = "#999";
            }

        }

    }
);

canvas.addEventListener(
    "click",
    event => {
        toolsMenu.hidden = true;
        moreToolsButton.setAttribute("aria-expanded", "false");
        if (suppressNextCanvasClick) {
            suppressNextCanvasClick = false;
            return;
        }
        if (isLocked || event.button !== 0) {
            return;
        }

        const mouse = getMousePosition(event);
        const element = findElementAt(mouse.x, mouse.y);

        if (currentTool === "text" || currentTool === "note") {
            const editable = element &&
                (element.type === "text" || element.type === "note")
                ? element
                : null;

            openTextEditor(
                editable,
                mouse.x,
                mouse.y
            );
            return;
        }

        if (!element) {
            selectedElement = null;
            selectedElements = [];
            selectTool("select");
            render();
        }
    }
);


// ============================================================
// Mouse Move
// ============================================================

window.addEventListener(
    "mousemove",
    event => {

        // ========================================
        // PAN
        // ========================================

        if (isPanning) {

            viewOffsetX =
                event.clientX - panStartX;

            viewOffsetY =
                event.clientY - panStartY;

            render();
            return;
        }


        const mouse =
            getMousePosition(event);

        if (isMarqueeSelecting) {
            marqueeEnd = mouse;
            render();
            return;
        }

        if (isErasing) {
            eraseFreehandAt(mouse);
            return;
        }

        if (isRemoving) {
            removeObjectAt(mouse);
            return;
        }

        if (isResizing && resizeStartBounds && resizeStartPointer && resizeGroupOriginals.length > 1) {
            const nextBounds = getResizedBounds(resizeHandle, resizeStartBounds, mouse);
            const scaleX = nextBounds.width / Math.max(1, resizeStartBounds.width);
            const scaleY = nextBounds.height / Math.max(1, resizeStartBounds.height);
            resizeGroupOriginals.forEach(({ element, original, bounds }) => {
                const itemBounds = {
                    x: nextBounds.x + (bounds.x - resizeStartBounds.x) * scaleX,
                    y: nextBounds.y + (bounds.y - resizeStartBounds.y) * scaleY,
                    width: bounds.width * scaleX,
                    height: bounds.height * scaleY
                };
                resizeSelectedElement(element, original, bounds, itemBounds);
            });
            render();
            return;
        }

        if (isResizing && resizeElement && resizeStartBounds && resizeStartPointer) {
            const nextBounds = getResizedBounds(resizeHandle, resizeStartBounds, mouse);
            resizeSelectedElement(resizeElement, resizeOriginalElement, resizeStartBounds, nextBounds);
            render();
            return;
        }


        // ========================================
        // DRAG SELECTED ELEMENT
        // ========================================

        if (
            isDragging &&
            draggedElement
        ) {

            const dx =
                mouse.x -
                lastMouseWorldX;

            const dy =
                mouse.y -
                lastMouseWorldY;


            draggedElements.forEach(element => moveElement(element, dx, dy));


            lastMouseWorldX =
                mouse.x;

            lastMouseWorldY =
                mouse.y;


            render();

            return;
        }


        // ========================================
        // DRAW
        // ========================================

        if (!isDrawing) {
            return;
        }

        if (currentTool === "lasso") {
            lassoPoints.push(mouse);
            render();
            return;
        }

        if (currentTool === "laser") {
            laserPoints.push(mouse);
            render();
            return;
        }

        currentX = mouse.x;
        currentY = mouse.y;


        // ========================================
        // PEN
        // ========================================

        if (
            currentTool === "pen"
        ) {

            previewElement.points.push({

                x: mouse.x,

                y: mouse.y

            });

        }


        // ========================================
        // LINE
        // ========================================

        else if (
            currentTool === "line"
        ) {

            previewElement.endX =
                mouse.x;

            previewElement.endY =
                mouse.y;

        }


        // ========================================
        // ARROW
        // ========================================

        else if (
            currentTool === "arrow"
        ) {

            previewElement.endX =
                mouse.x;

            previewElement.endY =
                mouse.y;

        }


        // ========================================
        // SHAPES
        // ========================================

        else {

            const rect =
                getRectangleFromPoints(
                    startX,
                    startY,
                    mouse.x,
                    mouse.y
                );


            previewElement.x =
                rect.x;

            previewElement.y =
                rect.y;

            previewElement.width =
                rect.width;

            previewElement.height =
                rect.height;

        }


        render();

    }
);




// ============================================================
// Move element
// ============================================================

function moveElement(
    element,
    dx,
    dy
) {

    if (
        element.type === "pen"
    ) {

        for (
            const point of element.points
        ) {

            point.x += dx;

            point.y += dy;

        }

        return;

    }


    element.x += dx;

    element.y += dy;


    if (
        element.type === "line" ||
        element.type === "arrow"
    ) {

        element.endX += dx;

        element.endY += dy;

    }

}


// ============================================================
// Mouse Up
// ============================================================

window.addEventListener(
    "mouseup",
    event => {
        if (currentTool === "select" && event.button === 0 && !isMarqueeSelecting) {
            lastSelectClick = {
                time: Date.now(),
                clientX: event.clientX,
                clientY: event.clientY
            };
        }

        if (isMarqueeSelecting && marqueeStart && marqueeEnd) {
            const bounds = getRectangleFromPoints(
                marqueeStart.x,
                marqueeStart.y,
                marqueeEnd.x,
                marqueeEnd.y
            );
            if (bounds.width > 3 / zoom || bounds.height > 3 / zoom) {
                const matches = elements.filter(element =>
                    rectanglesIntersect(getElementBounds(element), bounds)
                );
                selectedElements = event.shiftKey
                    ? [...new Set([...selectedElements, ...matches])]
                    : matches;
                selectedElement = selectedElements[selectedElements.length - 1] || null;
            }
            suppressNextCanvasClick = true;
            isMarqueeSelecting = false;
            marqueeStart = null;
            marqueeEnd = null;
            render();
            return;
        }

        // ========================================
        // FINISH PAN
        // ========================================

        if (isPanning) {

            isPanning = false;
            updateCanvasCursor();

            return;
        }

        if (isErasing) {
            isErasing = false;
            lastErasePoint = null;
            if (eraseHistorySaved) {
                saveToLocalStorage();
            }
            eraseHistorySaved = false;
            return;
        }

        if (isRemoving) {
            isRemoving = false;
            removeHistorySaved = false;
            return;
        }

        if (isResizing) {
            isResizing = false;
            resizeElement = null;
            resizeHandle = null;
            resizeStartBounds = null;
            resizeStartPointer = null;
            resizeOriginalElement = null;
            resizeGroupOriginals = [];
            saveToLocalStorage();
            render();
            return;
        }


        // ========================================
        // FINISH DRAGGING
        // ========================================

        if (isDragging) {

            isDragging = false;

            draggedElement = null;
            draggedElements = [];

            saveToLocalStorage();

            render();

            return;
        }


        // ========================================
        // FINISH DRAWING
        // ========================================

        if (!isDrawing) {
            return;
        }


        const mouse =
            getMousePosition(event);

        if (currentTool === "lasso") {
            isDrawing = false;
            if (lassoPoints.length >= 3) {
                selectedElements = elements.filter(element => isElementInsideLasso(element, lassoPoints));
                selectedElement = selectedElements[0] || null;
            }
            lassoPoints = [];
            render();
            return;
        }

        if (currentTool === "laser") {
            isDrawing = false;
            laserExpiresAt = Date.now() + 1200;
            if (laserTimeout) {
                clearTimeout(laserTimeout);
            }
            const fadeLaser = () => {
                if (!laserExpiresAt) {
                    return;
                }
                if (Date.now() >= laserExpiresAt) {
                    laserPoints = [];
                    laserExpiresAt = 0;
                    laserTimeout = null;
                    render();
                    return;
                }
                render();
                laserTimeout = setTimeout(fadeLaser, 30);
            };
            laserTimeout = setTimeout(fadeLaser, 30);
            return;
        }


        // ========================================
        // PEN
        // ========================================

        if (
            currentTool === "pen"
        ) {

            if (
                previewElement &&
                previewElement.points.length >= 2
            ) {

                saveHistory();

                elements.push(
                    previewElement
                );

            }

        }


        // ========================================
        // LINE
        // ========================================

        else if (
            currentTool === "line"
        ) {

            const distance =
                Math.hypot(
                    mouse.x - startX,
                    mouse.y - startY
                );


            if (
                distance > 2 &&
                previewElement
            ) {

                saveHistory();

                previewElement.endX =
                    mouse.x;

                previewElement.endY =
                    mouse.y;

                elements.push(
                    previewElement
                );

            }

        }


        // ========================================
        // ARROW
        // ========================================

        else if (
            currentTool === "arrow"
        ) {

            const distance =
                Math.hypot(
                    mouse.x - startX,
                    mouse.y - startY
                );


            if (
                distance > 2 &&
                previewElement
            ) {

                saveHistory();

                previewElement.endX =
                    mouse.x;

                previewElement.endY =
                    mouse.y;

                elements.push(
                    previewElement
                );

            }

        }


        // ========================================
        // SHAPES
        // ========================================

        else {

            const rect =
                getRectangleFromPoints(
                    startX,
                    startY,
                    mouse.x,
                    mouse.y
                );


            if (
                rect.width > 2 &&
                rect.height > 2 &&
                previewElement
            ) {

                saveHistory();

                previewElement.x =
                    rect.x;

                previewElement.y =
                    rect.y;

                previewElement.width =
                    rect.width;

                previewElement.height =
                    rect.height;

                elements.push(
                    previewElement
                );

            }

        }


        // ========================================
        // RESET
        // ========================================

        isDrawing = false;

        previewElement = null;

        saveToLocalStorage();

        render();

    }
);



// ============================================================
// Keyboard shortcuts
// ============================================================

document.addEventListener(
    "keydown",
    event => {

        if (
            activeTextEditor &&
            event.target === activeTextEditor.input
        ) {
            return;
        }
    if (event.target instanceof HTMLElement &&
        event.target.matches("input, textarea, select, [contenteditable='true']")) {
        return;
    }

        // Space = pan

        if (event.code === "Space") {

            event.preventDefault();

            if (!event.repeat) {

                isSpacePressed = true;

                updateCanvasCursor();

            }

        }

        if (event.key === "Escape") {
            toolsMenu.hidden = true;
            moreToolsButton.setAttribute("aria-expanded", "false");
            if (!embedDialog.hidden) {
                embedDialog.hidden = true;
                embedForm.reset();
            }
            if (activeEmbedId) {
                activeEmbedId = null;
                renderEmbedOverlays();
            }
        }

        // Delete

        if (
            event.key === "Delete" ||
            event.key === "Backspace"
        ) {

            if (
                !isLocked &&
                selectedElement
            ) {

                event.preventDefault();

                deleteSelectedElement();

            }

        }


        // Undo
        // Ctrl + Z / Cmd + Z

        if (
            (event.ctrlKey ||
                event.metaKey) &&
            event.key.toLowerCase() === "z"
        ) {

            event.preventDefault();

            if (event.shiftKey) {

                redo();

            }

            else {

                undo();

            }

        }


        // Redo
        // Ctrl + Y / Cmd + Y

        if (
            (event.ctrlKey ||
                event.metaKey) &&
            event.key.toLowerCase() === "y"
        ) {

            event.preventDefault();

            redo();

        }


        // Tool shortcuts

        if (!event.ctrlKey && !event.metaKey && !event.altKey) {

        if (event.shiftKey && event.key.toLowerCase() === "x") {
            event.preventDefault();
            convertDrawingToShape();
        }

        if (event.key === "9") {
            imagePicker.click();
        }

        if (event.key.toLowerCase() === "f") {
            selectTool("frame");
        }

        if (event.key.toLowerCase() === "k") {
            selectTool("laser");
        }

        if (event.key.toLowerCase() === "b") {
            selectTool("bucket");
        }

        if (event.key.toLowerCase() === "n") {
            selectTool("note");
        }

        if (
            event.key.toLowerCase() === "v"
        ) {

            selectTool("select");

        }

        if (
            event.key.toLowerCase() === "h"
        ) {

            selectTool("pan");

        }

        if (
            event.key.toLowerCase() === "r"
        ) {

            selectTool("rectangle");

        }

        if (
            event.key.toLowerCase() === "o"
        ) {

            selectTool("ellipse");

        }

        if (
            event.key.toLowerCase() === "d"
        ) {

            selectTool("diamond");

        }

        if (
            event.key.toLowerCase() === "l"
        ) {

            selectTool("line");

        }

        if (
            event.key.toLowerCase() === "a"
        ) {

            selectTool("arrow");

        }

        if (
            event.key.toLowerCase() === "p"
        ) {

            selectTool("pen");

        }

        if (
            event.key.toLowerCase() === "t"
        ) {

            selectTool("text");

        }

        if (
            event.key.toLowerCase() === "e"
        ) {

            selectTool("eraser");

        }

        }

    }
);


document.addEventListener(
    "keyup",
    event => {

        if (
            event.code === "Space"
        ) {

            event.preventDefault();

            isSpacePressed = false;

            updateCanvasCursor();

        }

    }
);


window.addEventListener(
    "blur",
    () => {
        if (isPanning || isSpacePressed || isErasing || isRemoving || isResizing) {
            isPanning = false;
            isSpacePressed = false;
            isErasing = false;
            isRemoving = false;
            isResizing = false;
            eraseHistorySaved = false;
            removeHistorySaved = false;
            updateCanvasCursor();
        }
    }
);


// ============================================================
// Select tool helper
// ============================================================

function selectTool(tool) {

    currentTool = tool;
    toolsMenu.hidden = true;
    moreToolsButton.setAttribute("aria-expanded", "false");

    updateActiveTool();

}


// ============================================================
// Delete selected element
// ============================================================

function deleteSelectedElement() {

    const selection = selectedElements.length ? selectedElements : selectedElement ? [selectedElement] : [];
    if (!selection.length) {

        return;

    }


    saveHistory();


    elements =
        elements.filter(
            element =>
                !selection.some(selected => selected.id === element.id)
        );


    selectedElement = null;
    selectedElements = [];

    saveToLocalStorage();

    render();

}

// ============================================================
// Zoom
// ============================================================


canvas.addEventListener(
    "wheel",
    event => {

        event.preventDefault();

        const rect =
            canvas.getBoundingClientRect();

        if (!event.ctrlKey) {
            viewOffsetX -= event.deltaX;
            viewOffsetY -= event.deltaY;
            render();
            return;
        }


        // Mouse position on screen

        const mouseX =
            event.clientX - rect.left;

        const mouseY =
            event.clientY - rect.top;


        // World position before zoom

        const worldX =
            (mouseX - viewOffsetX) / zoom;

        const worldY =
            (mouseY - viewOffsetY) / zoom;


        // Calculate new zoom

        const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
        setZoomAround(mouseX, mouseY, zoom * zoomFactor);

    },
    {
        passive: false
    }
);

function setZoomAround(screenX, screenY, nextZoom) {
    const clampedZoom = Math.max(0.1, Math.min(nextZoom, 30));
    const worldX = (screenX - viewOffsetX) / zoom;
    const worldY = (screenY - viewOffsetY) / zoom;
    viewOffsetX = screenX - worldX * clampedZoom;
    viewOffsetY = screenY - worldY * clampedZoom;
    zoom = clampedZoom;
    render();
}

zoomInButton.addEventListener("click", () => {
    setZoomAround(canvasWidth / 2, canvasHeight / 2, zoom * 1.2);
});

zoomOutButton.addEventListener("click", () => {
    setZoomAround(canvasWidth / 2, canvasHeight / 2, zoom / 1.2);
});



// ============================================================
// LocalStorage
// ============================================================

function saveToLocalStorage() {

    const data = {

        elements: elements,

        style: defaultStyle,

        zoom: zoom,

        viewOffsetX:
            viewOffsetX,

        viewOffsetY:
            viewOffsetY

    };


    try {

        localStorage.setItem(
            "my-whiteboard",
            JSON.stringify(data)
        );

    }

    catch (error) {

        console.error(
            "Could not save whiteboard:",
            error
        );

    }

}



// ============================================================
// Load LocalStorage
// ============================================================

function loadFromLocalStorage() {

    try {

        const saved =
            localStorage.getItem(
                "my-whiteboard"
            );


        if (!saved) {

            return;

        }


        const data =
            JSON.parse(saved);

        if (data.style && typeof data.style === "object") {
            if (typeof data.style.stroke === "string") {
                defaultStyle.stroke = data.style.stroke;
            }
            if (typeof data.style.textColor === "string") {
                defaultStyle.textColor = data.style.textColor;
            }
            else if (typeof data.style.stroke === "string") {
                defaultStyle.textColor = data.style.stroke;
            }
            if (typeof data.style.fill === "string") {
                defaultStyle.fill = data.style.fill;
                currentFillColor = data.style.fill;
            }
            if (["none", "solid", "hachure"].includes(data.style.fillMode)) {
                defaultStyle.fillMode = data.style.fillMode;
            }
            if (Number.isFinite(data.style.lineWidth) && data.style.lineWidth > 0) {
                defaultStyle.lineWidth = data.style.lineWidth;
            }
            if (["solid", "dashed", "dotted"].includes(data.style.strokeDash)) {
                defaultStyle.strokeDash = data.style.strokeDash;
            }
            if (Number.isFinite(data.style.roughness) && data.style.roughness >= 0) {
                defaultStyle.roughness = data.style.roughness;
            }
            if (["sharp", "rounded"].includes(data.style.cornerStyle)) {
                defaultStyle.cornerStyle = data.style.cornerStyle;
            }
            if (["straight", "curved", "elbow"].includes(data.style.arrowType)) {
                defaultStyle.arrowType = data.style.arrowType;
            }
            if (["none", "end", "both"].includes(data.style.arrowHeads)) {
                defaultStyle.arrowHeads = data.style.arrowHeads;
            }
            if (typeof data.style.fontFamily === "string") {
                defaultStyle.fontFamily = data.style.fontFamily;
            }
            if (Number.isFinite(data.style.fontSize) && data.style.fontSize >= 8) {
                defaultStyle.fontSize = data.style.fontSize;
            }
            if (["left", "center", "right"].includes(data.style.textAlign)) {
                defaultStyle.textAlign = data.style.textAlign;
            }
            if (Number.isFinite(data.style.opacity) && data.style.opacity >= 0 && data.style.opacity <= 1) {
                defaultStyle.opacity = data.style.opacity;
            }
        }

        // Load elements

        if (
            Array.isArray(
                data.elements
            )
        ) {

            elements =
                data.elements;

        }


        // Load zoom

        if (
            typeof data.zoom === "number"
        ) {

            zoom =
                Math.max(0.1, Math.min(data.zoom, 30));

        }


        // Load camera position

        if (
            typeof data.viewOffsetX === "number"
        ) {

            viewOffsetX =
                data.viewOffsetX;

        }


        if (
            typeof data.viewOffsetY === "number"
        ) {

            viewOffsetY =
                data.viewOffsetY;

        }

    }

    catch (error) {

        console.error(
            "Could not load whiteboard:",
            error
        );

        elements = [];

    }

}



// ============================================================
// Autosave
// ============================================================

setInterval(
    () => {

        saveToLocalStorage();

    },
    2000
);


// ============================================================
// Initialize
// ============================================================

loadFromLocalStorage();

resizeCanvas();

updateActiveTool();

render();


// ============================================================
// Expose useful functions for debugging
// ============================================================

window.MyDraw = {

    get elements() {
        return elements;
    },

    undo,

    redo,

    save: saveToLocalStorage,

    clear: () => {

        saveHistory();

        elements = [];

        selectedElement = null;
        selectedElements = [];

        saveToLocalStorage();

        render();

    }

};
