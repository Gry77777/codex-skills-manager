import { app, BrowserWindow, Menu, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AiController } from "./ai-controller.js";
import { SkillsController } from "./skills-controller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const controller = new SkillsController();
const aiController = new AiController(controller);
const githubDiscoveryRequests = new Map<string, AbortController>();
const aiAnalysisRequests = new Map<string, AbortController>();

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    title: "Codex 技能管理器",
    icon: getWindowIconPath(),
    backgroundColor: "#f6f7f9",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpc(): void {
  ipcMain.handle("skills:scanWithDiagnostics", () => controller.scanWithDiagnostics());
  ipcMain.handle("skills:scan", () => controller.scan());
  ipcMain.handle("skills:list", () => controller.list());
  ipcMain.handle("skills:setStatus", (_event, id: string, status: "enabled" | "disabled") =>
    controller.setStatus(id, status)
  );
  ipcMain.handle("skills:importFolder", (_event, folderPath: string) => controller.importFolder(folderPath));
  ipcMain.handle("skills:importGitHubUrl", (_event, githubUrl: string) => controller.importGitHubUrl(githubUrl));
  ipcMain.handle("skills:discoverGitHubSkills", async (_event, githubUrl: string, requestId?: string) => {
    const abortController = requestId ? new AbortController() : null;
    if (requestId && abortController) {
      githubDiscoveryRequests.set(requestId, abortController);
    }

    try {
      return await controller.discoverGitHubSkills(githubUrl, abortController?.signal);
    } finally {
      if (requestId) {
        githubDiscoveryRequests.delete(requestId);
      }
    }
  });
  ipcMain.handle("skills:cancelGitHubDiscovery", (_event, requestId: string) => {
    githubDiscoveryRequests.get(requestId)?.abort();
  });
  ipcMain.handle("skills:importGitHubUrls", (_event, githubUrls: string[]) => controller.importGitHubUrls(githubUrls));
  ipcMain.handle("skills:searchMarketplace", (_event, input) => controller.searchMarketplace(input));
  ipcMain.handle("skills:refreshMarketplaceSource", (_event, sourceId: string, input) =>
    controller.refreshMarketplaceSource(sourceId, input)
  );
  ipcMain.handle("skills:getRootSettings", () => controller.getRootSettings());
  ipcMain.handle("skills:saveRootSettings", (_event, settings) => controller.saveRootSettings(settings));
  ipcMain.handle("skills:importLocalSkills", () => controller.importLocalSkills());
  ipcMain.handle("skills:repairBrokenSkills", () => controller.repairBrokenSkills());
  ipcMain.handle("skills:selectFolder", () => controller.selectFolder());
  ipcMain.handle("skills:revealInExplorer", (_event, id: string) => controller.revealInExplorer(id));
  ipcMain.handle("skills:readSkillMd", (_event, id: string) => controller.readSkillMd(id));
  ipcMain.handle("ai:getSettings", () => aiController.getSettings());
  ipcMain.handle("ai:saveSettings", (_event, settings) => aiController.saveSettings(settings));
  ipcMain.handle("ai:testConnection", (_event, settings) => aiController.testConnection(settings));
  ipcMain.handle("ai:analyzeSkill", (_event, input) => aiController.analyzeSkill(input));
  ipcMain.handle("ai:getAnalysisCache", () => aiController.getAnalysisCache());
  ipcMain.handle("ai:analyzeSkills", async (event, skillIds: string[], requestId?: string) => {
    const abortController = requestId ? new AbortController() : null;
    if (requestId && abortController) {
      aiAnalysisRequests.set(requestId, abortController);
    }

    try {
      return await aiController.analyzeSkills(skillIds, (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("ai:analyzeSkillsProgress", { ...progress, requestId });
        }
      }, abortController?.signal);
    } finally {
      if (requestId) {
        aiAnalysisRequests.delete(requestId);
      }
    }
  });
  ipcMain.handle("ai:cancelAnalyzeSkills", (_event, requestId: string) => {
    aiAnalysisRequests.get(requestId)?.abort();
  });
}

function getWindowIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon.ico");
  }

  return path.join(__dirname, "../../build/icon.ico");
}
