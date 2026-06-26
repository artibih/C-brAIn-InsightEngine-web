import {Component, EventEmitter, HostListener, inject, Input, OnInit, Output} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {ButtonComponent} from '../../shared/button/button.component';
import {Router} from '@angular/router';
import {SavedConversation} from '../../models/conversation.models';
import {AuthService} from '../../core/auth/auth.service';
import {Project, PROJECT_COLORS, PROJECT_ICONS} from '../../models/project.model';
import {ProjectService} from '../../services/project.service';
import {ThemeService} from '../../services/theme.service';

@Component({
    selector: 'app-sidebar',
    imports: [CommonModule, ButtonComponent, FormsModule],
    templateUrl: './sidebar.component.html',
    styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {
  @Input() conversations: SavedConversation[] = [];
  @Input() isLoadingConversations = false;
  @Input() hasMoreConversations = false;
  @Input() loadingMoreConversations = false;
  @Output() newConversation = new EventEmitter<void>();
  @Output() newProject = new EventEmitter<void>();
  @Output() openSettings = new EventEmitter<void>();
  @Output() conversationSelected = new EventEmitter<SavedConversation>();
  @Output() conversationDeleted = new EventEmitter<string>();
  @Output() loadMore = new EventEmitter<void>();
  @Input() activeId: string | null = null;
  @Output() openAdminPanel = new EventEmitter<void>();
  @Output() openFeedback = new EventEmitter<void>();
  @Output() closeSidebar = new EventEmitter<void>();

  private auth = inject(AuthService);
  private projectService = inject(ProjectService);
  readonly theme = inject(ThemeService);

  readonly isAdmin$ = this.auth.isAdmin$;
  readonly projectColors = PROJECT_COLORS;
  readonly projectIcons = PROJECT_ICONS;

  showProjectModal = false;
  savingProject = false;
  editingProject: Project | null = null;
  modalName = '';
  modalDescription = '';
  modalColor = PROJECT_COLORS[0];
  modalIcon = PROJECT_ICONS[0];

  newProjectId: string | null = null;

  showDeleteModal = false;
  pendingDeleteId: string | null = null;

  showDeleteProjectModal = false;
  pendingDeleteProjectId: string | null = null;

  draggedConversationId: string | null = null;
  draggedFromProjectId: string | null = null;
  dragOverProjectId: string | null = null;
  dragOverUnassigned = false;

  projects: Project[] = [];

  constructor(public router: Router) {}

  ngOnInit(): void {
    this.projectService.projects$.subscribe(projects => {
      this.projects = projects;
    });
    this.projectService.loadProjects();
  }

  get unassignedConversations(): SavedConversation[] {
    const projectIds = new Set(this.projects.map(p => p.id));
    return this.conversations.filter(c => !c.projectId || !projectIds.has(c.projectId));
  }

  getProjectConversations(project: Project): SavedConversation[] {
    return this.conversations.filter(c => c.projectId === project.id);
  }

  openCreateModal(): void {
    this.editingProject = null;
    this.modalName = '';
    this.modalDescription = '';
    this.modalColor = PROJECT_COLORS[0];
    this.modalIcon = PROJECT_ICONS[0];
    this.showProjectModal = true;

  }

  openEditModal(event: MouseEvent, project: Project): void {
    event.stopPropagation();
    this.editingProject = project;
    this.modalName = project.name;
    this.modalDescription = project.description || '';
    this.modalColor = project.color;
    this.modalIcon = project.icon;
    this.showProjectModal = true;

  }

  closeProjectModal(): void {
    this.showProjectModal = false;
    this.editingProject = null;

  }

  saveProjectFromModal(): void {
    if (!this.modalName.trim() || this.savingProject) return;

    const data = {
      name: this.modalName.trim(),
      description: this.modalDescription.trim() || undefined,
      color: this.modalColor,
      icon: this.modalIcon
    };

    if (this.editingProject) {
      this.projectService.updateProject(this.editingProject.id, data);
      this.closeProjectModal();
    } else {
      this.savingProject = true;
      this.projectService.createProject(data).subscribe({
        next: (res) => {
          if (res.success && res.data) {
            this.newProjectId = res.data.id;
            setTimeout(() => (this.newProjectId = null), 600);
          }
          this.savingProject = false;
          this.closeProjectModal();
        },
        error: () => {
          this.savingProject = false;
          this.closeProjectModal();
        }
      });
    }
  }

  deleteProject(event: MouseEvent, projectId: string): void {
    event.stopPropagation();
    this.pendingDeleteProjectId = projectId;
    this.showDeleteProjectModal = true;

  }

  confirmDeleteProject(): void {
    if (this.pendingDeleteProjectId) {
      this.projectService.deleteProject(this.pendingDeleteProjectId);
    }
    this.closeDeleteProjectModal();
  }

  closeDeleteProjectModal(): void {
    this.showDeleteProjectModal = false;
    this.pendingDeleteProjectId = null;

  }

  toggleProject(project: Project): void {
    this.projectService.toggleProjectExpanded(project.id);
  }

  onDragStart(event: DragEvent, conversationId: string, fromProjectId: string | null = null): void {
    this.draggedConversationId = conversationId;
    this.draggedFromProjectId = fromProjectId;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', conversationId);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  private clearDragState(): void {
    this.draggedConversationId = null;
    this.draggedFromProjectId = null;
    this.dragOverProjectId = null;
    this.dragOverUnassigned = false;
  }

  @HostListener('document:dragend')
  @HostListener('document:drop')
  onDragEnd(): void {
    this.clearDragState();
  }

  @HostListener('document:keydown.escape')
  onDragEscape(): void {
    if (this.draggedConversationId !== null) {
      this.clearDragState();
    }
  }

  onDragOverProject(event: DragEvent, projectId: string): void {
    if (this.draggedFromProjectId === projectId) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverProjectId = projectId;
  }

  onDragLeaveProject(event: DragEvent, projectEl: HTMLElement): void {
    const related = event.relatedTarget as Node | null;
    if (!related || !projectEl.contains(related)) {
      this.dragOverProjectId = null;
    }
  }

  onDropOnProject(event: DragEvent, projectId: string): void {
    if (this.draggedFromProjectId === projectId) return;
    event.preventDefault();
    const convId = this.draggedConversationId;
    const fromProjectId = this.draggedFromProjectId;
    this.clearDragState();
    if (convId) {
      if (fromProjectId) {
        this.projectService.removeConversationFromProject(fromProjectId, convId);
      }
      this.projectService.addConversationToProject(projectId, convId);
    }
  }

  onDragOverUnassigned(event: DragEvent): void {
    if (!this.draggedFromProjectId) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverUnassigned = true;
  }

  onDragLeaveUnassigned(event: DragEvent, zoneEl: HTMLElement): void {
    const related = event.relatedTarget as Node | null;
    if (!related || !zoneEl.contains(related)) {
      this.dragOverUnassigned = false;
    }
  }

  onDropOnUnassigned(event: DragEvent): void {
    if (!this.draggedFromProjectId) return;
    event.preventDefault();
    const convId = this.draggedConversationId;
    const fromProjectId = this.draggedFromProjectId;
    this.clearDragState();
    if (convId && fromProjectId) {
      this.projectService.removeConversationFromProject(fromProjectId, convId);
    }
  }

  removeFromProject(event: MouseEvent, projectId: string, conversationId: string): void {
    event.stopPropagation();
    this.projectService.removeConversationFromProject(projectId, conversationId);
  }

  onNewConversation(): void {
    this.newConversation.emit();
  }

  onOpenKnowledgeGraph(): void {
    this.router.navigate(['/knowledge-graph']);
  }

  onOpenSettings(): void {
    this.openSettings.emit();
  }
  onOpenFeedback(): void {
    this.openFeedback.emit();
  }
  onOpenAdminPanel(): void {
    this.openAdminPanel.emit();
  }

  onSelectConversation(conv: SavedConversation): void {
    this.conversationSelected.emit(conv);
  }

  onDeleteConversation(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.pendingDeleteId = id;
    this.showDeleteModal = true;

  }

  confirmDelete(): void {
    if (this.pendingDeleteId) {
      this.conversationDeleted.emit(this.pendingDeleteId);
    }
    this.closeDeleteModal();
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.pendingDeleteId = null;

  }

  onCloseSidebar(): void {
    this.closeSidebar.emit();
  }

  onLoadMore(): void {
    this.loadMore.emit();
  }

  formatDate(raw: string | number | Date): string {
    const date = new Date(raw);

    const weekday = date.toLocaleString('en-US', { weekday: 'short' });
    const time = date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return `${weekday} ${time}`;
  }

}
