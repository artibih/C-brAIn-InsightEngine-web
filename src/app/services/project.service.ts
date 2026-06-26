import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Project, ProjectDto, ProjectLocalMeta, PROJECT_COLORS, PROJECT_ICONS } from '../models/project.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private http = inject(HttpClient);
  private readonly META_KEY = 'cbrain-projects-meta';
  private readonly apiUrl = `${environment.apiBaseUrl}/Projects`;

  private projectsSubject = new BehaviorSubject<Project[]>([]);
  projects$ = this.projectsSubject.asObservable();

  private loaded = false;

  



  updateConversationProjectId: ((conversationId: string, projectId: string | null) => void) | null = null;

  getProjects(): Project[] {
    if (!this.loaded) {
      this.loadProjects();
    }
    return this.projectsSubject.value;
  }

  loadProjects(): void {
    this.loaded = true;
    this.http.get<ApiResponse<ProjectDto[]>>(this.apiUrl).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const metaMap = this.getMetaMap();
          const projects = res.data.map(dto => this.toProject(dto, metaMap[dto.id]));
          this.projectsSubject.next(projects);
        }
      },
      error: () => {
        this.projectsSubject.next([]);
      }
    });
  }

  getProjectById(id: string): Project | undefined {
    return this.projectsSubject.value.find(p => p.id === id);
  }

  createProject(data: { name: string; description?: string; color: string; icon: string }): Observable<ApiResponse<ProjectDto>> {
    const body = {
      name: data.name,
      description: data.description || null,
      color: data.color,
      icon: data.icon
    };

    return this.http.post<ApiResponse<ProjectDto>>(this.apiUrl, body).pipe(
      tap({
        next: (res) => {
          if (res.success && res.data) {
            this.saveMeta(res.data.id, { isExpanded: true });
          }
          this.loadProjects();
        },
        error: () => {
          this.loadProjects();
        }
      })
    );
  }

  updateProject(id: string, data: { name: string; description?: string; color: string; icon: string }): void {
    const body = {
      name: data.name,
      description: data.description || null,
      color: data.color,
      icon: data.icon
    };

    this.http.put<ApiResponse<ProjectDto>>(`${this.apiUrl}/${id}`, body).subscribe({
      next: () => {
        this.loadProjects();
      },
      error: () => {
        this.loadProjects();
      }
    });
  }

  deleteProject(id: string): void {
    
    
    this.unassignConversationsForProject(id);

    this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/${id}`).subscribe({
      next: () => {
        this.removeMeta(id);
        this.projectsSubject.next(this.projectsSubject.value.filter(p => p.id !== id));
      }
    });
  }

  
  private unassignConversationsForProject(projectId: string): void {
    if (this.bulkClearProjectCallback) {
      this.bulkClearProjectCallback(projectId);
    }
  }

  



  bulkClearProjectCallback: ((projectId: string) => void) | null = null;

  addConversationToProject(projectId: string, conversationId: string): void {
    this.updateConversationProjectId?.(conversationId, projectId);

    this.http.post<ApiResponse<unknown>>(
      `${this.apiUrl}/${projectId}/chats/${conversationId}`, null
    ).subscribe();
  }

  removeConversationFromProject(projectId: string, conversationId: string): void {
    this.updateConversationProjectId?.(conversationId, null);

    this.http.delete<ApiResponse<unknown>>(
      `${this.apiUrl}/${projectId}/chats/${conversationId}`
    ).subscribe();
  }

  removeConversationFromAllProjects(conversationId: string): void {
    this.updateConversationProjectId?.(conversationId, null);
  }

  toggleProjectExpanded(id: string): void {
    const projects = this.projectsSubject.value.map(p => {
      if (p.id === id) {
        const updated = { ...p, isExpanded: !p.isExpanded };
        this.saveMeta(id, { isExpanded: updated.isExpanded });
        return updated;
      }
      return p;
    });
    this.projectsSubject.next(projects);
  }

  private toProject(dto: ProjectDto, meta?: ProjectLocalMeta): Project {
    return {
      id: dto.id,
      name: dto.name,
      description: dto.description || undefined,
      color: dto.color || PROJECT_COLORS[0],
      icon: dto.icon || PROJECT_ICONS[0],
      createdAt: new Date(dto.createdAt),
      updatedAt: new Date(dto.createdAt),
      isExpanded: meta?.isExpanded ?? true
    };
  }

  private getMetaMap(): Record<string, ProjectLocalMeta> {
    try {
      return JSON.parse(localStorage.getItem(this.META_KEY) || '{}');
    } catch {
      return {};
    }
  }

  private getMeta(id: string): ProjectLocalMeta | undefined {
    return this.getMetaMap()[id];
  }

  private saveMeta(id: string, meta: ProjectLocalMeta): void {
    const map = this.getMetaMap();
    map[id] = meta;
    localStorage.setItem(this.META_KEY, JSON.stringify(map));
  }

  private removeMeta(id: string): void {
    const map = this.getMetaMap();
    delete map[id];
    localStorage.setItem(this.META_KEY, JSON.stringify(map));
  }
}
