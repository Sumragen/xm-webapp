import { HttpResponse } from '@angular/common/http';
import {
    Component,
    Inject,
    InjectionToken,
    Injector,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    SimpleChanges,
    ViewChild,
    ViewContainerRef
} from '@angular/core';
import { ComponentPortal, PortalInjector } from '@angular/cdk/portal';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { JhiEventManager } from 'ng-jhipster';
import { Observable ,  Subscription, of } from 'rxjs';
import { finalize, map, tap, catchError } from 'rxjs/operators';

import { ContextService, I18nNamePipe, ITEMS_PER_PAGE, Principal } from '../../shared';
import { saveFile } from '../../shared/helpers/file-download-helper';
import { buildJsfAttributes, transpilingForIE } from '../../shared/jsf-extention/jsf-attributes-helper';
import { XM_EVENT_LIST } from '../../xm.constants';
import { FunctionCallDialogComponent } from '../function-call-dialog/function-call-dialog.component';
import { Spec } from '../shared/spec.model';
import { XmEntity } from '../shared/xm-entity.model';
import { XmEntityService } from '../shared/xm-entity.service';
import { EntityListCardOptions, EntityOptions, FieldOptions } from './entity-list-card-options.model';
import { XmEntitySpecWrapperService } from '../shared/xm-entity-spec-wrapper.service';
import { XmEntitySpec } from '../shared/xm-entity-spec.model';
import * as _ from 'lodash'
import { getFieldValue } from '../../shared/helpers/entity-list-helper';
import { EntityCompactCardComponent } from './entity-compact-card/entity-compact-card.component';
import { CdkOverlayOrigin, Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { over } from 'webstomp-client';
import { CONTAINER_DATA } from '../shared/tokens';

declare let swal: any;

@Component({
    selector: 'xm-entity-list-card',
    templateUrl: './entity-list-card.component.html',
    styleUrls: ['./entity-list-card.component.scss']
})
export class EntityListCardComponent implements OnInit, OnChanges, OnDestroy {

    private entityListActionSuccessSubscription: Subscription;
    private entityEntityListModificationSubscription: Subscription;

    @Input() spec: Spec;
    @Input() options: EntityListCardOptions;

    overlayRef: OverlayRef;
    @ViewChild(CdkOverlayOrigin, {static: false}) _overlayOrigin: CdkOverlayOrigin;

    isShowFilterArea = false;
    list: EntityOptions[];
    activeItemId = 0;
    entitiesPerPage: any;
    predicate = 'id';
    reverse: boolean;
    showLoader: boolean;
    firstPage = 1;
    cardPosition = {
        x: '',
        y: ''
    };

    constructor(private xmEntitySpecWrapperService: XmEntitySpecWrapperService,
                private xmEntityService: XmEntityService,
                private eventManager: JhiEventManager,
                private modalService: NgbModal,
                private translateService: TranslateService,
                private i18nNamePipe: I18nNamePipe,
                private router: Router,
                private contextService: ContextService,
                public principal: Principal,
                public overlay: Overlay,
                public viewContainerRef: ViewContainerRef,
                private injector: Injector) {
        this.entitiesPerPage = ITEMS_PER_PAGE;
    }

    ngOnInit() {
        console.log(this);
        this.entityListActionSuccessSubscription = this.eventManager.subscribe(XM_EVENT_LIST.XM_FUNCTION_CALL_SUCCESS,
            () => this.load());
        this.entityEntityListModificationSubscription = this.eventManager.subscribe(XM_EVENT_LIST.XM_ENTITY_LIST_MODIFICATION,
            () => this.load());
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes.options && !_.isEqual(changes.options.previousValue, changes.options.currentValue)) {
            this.predicate = 'id';
            this.reverse = false;
            this.load();
        }
    }

    ngOnDestroy() {
        this.eventManager.destroy(this.entityListActionSuccessSubscription);
        this.eventManager.destroy(this.entityEntityListModificationSubscription);
    }

    load() {
        // TODO: move processing of options.entities to onChange hook.
        //  Will options ever change after component initialization?
        if (this.options.entities) {
            this.list = this.options.entities.map(e => {
                e.page = this.firstPage;
                e.xmEntitySpec = this.spec.types.filter(t => t.key === e.typeKey).shift();
                e.currentQuery = e.currentQuery ? e.currentQuery : this.getDefaultSearch(e);
                if (e.filter) {
                    e['filterJsfAttributes'] = buildJsfAttributes(e.filter.dataSpec, e.filter.dataForm);
                }
                if (e.fields) { // Workaroud: server sorting doesn't work atm for nested "data" fields
                    e.fields
                        .filter(f => f.field && f.field.indexOf('data.') === 0)
                        .map(f => f.sortable = false);
                }
                return e;
            });
            if (!this.list.length) {
                return;
            }

            if (!this.list[this.activeItemId]) {
                this.setActiveTab(0);
            } else {
                const activeItem = this.list[this.activeItemId];
                if (activeItem.query) {
                    activeItem.currentQuery = activeItem.query;
                }
                this.loadEntities(activeItem).subscribe(resp => activeItem.entities = resp);
            }
        }
    }

    onRefresh() {
        this.filtersReset(this.list[this.activeItemId]);
        this.loadEntities(this.list[this.activeItemId]).subscribe(result => {
            this.list[this.activeItemId].entities = result;
        });
    }

    filtersReset(activeList: any): void {
        const filter = activeList.filter || null;
        if (filter) {
            activeList['filterJsfAttributes'] = buildJsfAttributes(filter.dataSpec, filter.dataForm);
            activeList.currentQuery = null;
            activeList.currentQuery = this.getDefaultSearch(activeList);
        }
    }

    private loadEntities(entityOptions: EntityOptions): Observable<XmEntity[]> {
        this.showLoader = true;
        const options: any = {
            typeKey: entityOptions.typeKey,
            page: entityOptions.page - 1,
            size: this.entitiesPerPage,
            sort: [this.predicate + ',' + (this.reverse ? 'asc' : 'desc')]
        };
        let method = 'query';
        if (entityOptions.currentQuery) {
            options.query = entityOptions.currentQuery;
            method = 'search';
        }

        return this.xmEntityService[method](options).pipe(
            tap((xmEntities: HttpResponse<XmEntity[]>) => {
                entityOptions.totalItems = xmEntities.headers.get('X-Total-Count');
                entityOptions.queryCount = entityOptions.totalItems;
            }),
            map((xmEntities: HttpResponse<XmEntity[]>) => xmEntities.body),
            map((xmEntities: XmEntity[]) => {
                return xmEntities.map(e => this.enrichEntity(e));
            }),
            catchError((err) => {
                console.log(err);
                this.showLoader = false;
                return of([]);
            }),
            finalize(() => this.showLoader = false));
    }

    /**
     * Method is used to enrich XmEntity with spec details
     * @param entity current entity
     */
    private enrichEntity(entity: XmEntity): XmEntity {
        entity['type'] = this.spec.types.filter(t => t.key === entity.typeKey).shift();
        const states = entity['type'].states;
        if (states && states.length && entity.stateKey) {
            entity['state'] = states.filter(s => s.key === entity.stateKey).shift();
        }
        return entity;
    }

    setActiveTab(i: number) {
        this.activeItemId = i;
        const entityOptions = this.list[i];
        entityOptions.currentQuery = entityOptions.query;
        this.loadEntities(entityOptions).subscribe(result => this.list[i].entities = result);
    }

    getFieldValue(xmEntity: any = {}, field: FieldOptions): any {
        return getFieldValue(xmEntity, field);
    }

    transition() {
        this.load();
    }

    onLoadPage(entityOptions: EntityOptions) {
        this.loadEntities(entityOptions).subscribe(result => entityOptions.entities = result);
    }

    onNavigate(entityOptions: EntityOptions, xmEntity: XmEntity) {
        this.getRouterLink(entityOptions, xmEntity)
            .pipe(
                finalize(() => this.contextService.put('xmEntityId', xmEntity.id))
            ).subscribe(commands => this.router.navigate(commands));
    }

    private getRouterLink(entityOptions: EntityOptions, xmEntity: XmEntity): Observable<any[]> {

        if (entityOptions && entityOptions.routerLink) {
            const result = [];
            for (const l of entityOptions.routerLink) {
                if (l.startsWith('xmEntity')) {
                    result.push(xmEntity[l.split('.').pop()]);
                } else {
                    result.push(l);
                }
            }
            return of(result);
        }

        return this.getSpec(entityOptions, xmEntity).pipe(
            map(xmSpec => this.processXmSpec(xmSpec, xmEntity)),
            catchError(() => [])
        );

    }

    private processXmSpec(xmSpec: XmEntitySpec, xmEntity: XmEntity): any[] {
        if (!xmSpec) {
            return ['']
        }
        const form: string = xmSpec.dataForm || '{}';
        const entityConfig: any = JSON.parse(form).entity || {};

        return ['/application', xmEntity.typeKey, entityConfig.useKeyOnList ? xmEntity.key : xmEntity.id];
    }

    private getSpec(entityOptions: EntityOptions, xmEntity: XmEntity): Observable<XmEntitySpec> {

        if (entityOptions && entityOptions.xmEntitySpec) {
            return of(entityOptions.xmEntitySpec);
        }

        if (xmEntity && xmEntity.hasOwnProperty('type')) {
            return of(xmEntity['type']);
        }

        if (xmEntity && xmEntity.typeKey) {
            return this.xmEntitySpecWrapperService.xmSpecByKey(xmEntity.typeKey)
        }

        console.log(`No spec found by options=${entityOptions} or entity=${xmEntity}`);

        throw new Error('No spec found');
    }

    getFastSearches(entityOptions: EntityOptions) {
        return entityOptions.fastSearch ? entityOptions.fastSearch.filter(s => !!s.name) : null;
    }

    getDefaultSearch(entityOptions: EntityOptions): string {
        if (!entityOptions.fastSearch) {
            return null;
        }
        const fastSearchWithoutName = entityOptions.fastSearch.filter(s => !s.name).shift();
        return !fastSearchWithoutName ? null : fastSearchWithoutName.query;
    }

    onApplyFastSearch(entityOptions: EntityOptions, query) {
        entityOptions.currentQuery = query;
        this.loadEntities(entityOptions).subscribe(result => entityOptions.entities = result);
    }

    onApplyFilter(entityOptions: EntityOptions, data: any) {
        const copy = Object.assign({}, entityOptions);
        let funcValue;
        try {
            funcValue = new Function('return `' + entityOptions.filter.template + '`;').call(data);
        } catch (e) {
            // console.log('--------------- e onApplyFilter');
            funcValue = transpilingForIE(entityOptions.filter.template, data);
            // console.log('--------------- end');
        }
        copy.currentQuery = (copy.currentQuery ? copy.currentQuery : '') + ' ' + funcValue;
        entityOptions.currentQuery = copy.currentQuery;
        entityOptions.page = this.firstPage;
        this.loadEntities(entityOptions).subscribe(resp => this.list[this.activeItemId].entities = resp);
    }

    public onAction(entityOptions: EntityOptions, xmEntity: XmEntity, action): void {
        if (action.handler) {
            action.handler(xmEntity);
            return;
        }

        const modalRef = this.modalService.open(FunctionCallDialogComponent, {backdrop: 'static'});
        this.translateService.get('xm-entity.entity-list-card.action-dialog.question', {
            action: this.i18nNamePipe.transform(action.name, this.principal),
            name: xmEntity.name
        }).subscribe(result => {
            modalRef.componentInstance.dialogTitle = result;
        });
        modalRef.componentInstance.buttonTitle = action.name;
        modalRef.componentInstance.xmEntity = xmEntity;
        modalRef.componentInstance.functionSpec = entityOptions.xmEntitySpec.functions
            ? entityOptions.xmEntitySpec.functions.filter(f => f.key === action.functionKey).shift() : {key: action.functionKey};
    }

    onFileExport(entityOptions: EntityOptions, exportType: string) {
        this.showLoader = true;
        this.xmEntityService.fileExport(exportType, entityOptions.typeKey).pipe(
            // TODO: file name extract from the headers
            tap((resp: Blob) => saveFile(resp, `${entityOptions.typeKey}.` + exportType, 'text/csv')),
            finalize(() => this.showLoader = false)
        ).subscribe(
            () => {console.log(`Exported ${entityOptions.typeKey}`)},
            (err) => {console.log(err); this.showLoader = false}
        )
    }

    onRemove(xmEntity) {
        swal({
            title: this.translateService.instant('xm-entity.entity-list-card.delete.title'),
            showCancelButton: true,
            buttonsStyling: false,
            confirmButtonClass: 'btn mat-raised-button btn-primary',
            cancelButtonClass: 'btn mat-raised-button',
            confirmButtonText: this.translateService.instant('xm-entity.entity-list-card.delete.button')
        }).then((result) => {
            if (result.value) {
                this.xmEntityService.delete(xmEntity.id).subscribe(
                    () => {
                        this.eventManager.broadcast({
                            name: XM_EVENT_LIST.XM_ENTITY_LIST_MODIFICATION
                        });
                        this.alert('success', 'xm-entity.entity-list-card.delete.remove-success');
                    },
                    () => this.alert('error', 'xm-entity.entity-list-card.delete.remove-error')
                );
            }
        });
    }

    createInjector(data: any, overlayRef): PortalInjector {
        const injectorTokens = new WeakMap();
        injectorTokens.set(OverlayRef, overlayRef);
        injectorTokens.set(CONTAINER_DATA, data);
        return new PortalInjector(this.injector, injectorTokens);
    }

    onSelectRow(click, entity: XmEntity) {
        if (this.options.selectable) {
            if (this.options.broadcastEventName) {
                const event = this.options.broadcastEventName || '';
                this.eventManager.broadcast({name: event, data: entity});

                const strategy = this.overlay.position()
                    .flexibleConnectedTo(this._overlayOrigin.elementRef)
                    .withPositions([{originX: 'center', originY: 'center', overlayX: 'center', overlayY: 'center'}])
                    .withLockedPosition(true)
                    .withViewportMargin(50);

                const config = new OverlayConfig({
                    positionStrategy: strategy,
                    hasBackdrop: true,
                    backdropClass: 'transparent'
                });
                this.overlayRef = this.overlay.create(config);
                this.overlayRef.attach(
                    new ComponentPortal(
                        EntityCompactCardComponent,
                        this.viewContainerRef,
                        this.createInjector({entity: entity, config: this.options.entityCardOptions}, this.overlayRef))
                );
                this.overlayRef.backdropClick().subscribe(() => {
                    this.overlayRef.detach();
                });
            }
        }
    }

    private alert(type, key) {
        swal({
            type: type,
            text: this.translateService.instant(key),
            buttonsStyling: false,
            confirmButtonClass: 'btn btn-primary'
        });
    }

}
