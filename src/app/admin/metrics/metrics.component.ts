import { Component, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { finalize, take } from 'rxjs/operators';

import { JhiMetricsMonitoringModalComponent } from './metrics-modal.component';
import { JhiMetricsService } from './metrics.service';

@Component({
    selector: 'xm-metrics',
    templateUrl: './metrics.component.html',
    styleUrls: ['./metrics.component.scss'],
})
export class JhiMetricsMonitoringComponent implements OnInit {

    public allMetrics: any[];
    public metrics: any = {};
    public cachesStats: any = {};
    public servicesStats: any = {};
    public updatingMetrics: boolean = true;
    public JCACHE_KEY: string;
    public noData: boolean = false;
    public services: any[];
    public instances: any[];
    public selectedService: string = '';
    public selectedInstance: string = '';

    constructor(
        private modalService: NgbModal,
        private metricsService: JhiMetricsService,
    ) {
        this.JCACHE_KEY = 'jcache.statistics';
    }

    public ngOnInit(): void {
        this.initMonitoring();
    }

    public initMonitoring(): void {
        this.metricsService
            .getMonitoringServicesCollection()
            .subscribe((result) => {
                this.services = result || [];
                if (this.services.length > 0) {
                    this.selectedService = this.services[0].name;
                    this.onServiceSelect();
                }
            }, (error) => console.log(error));
    }

    public onServiceSelect(): void {
        this.instances = null;
        this.services
            .filter((s) => s.name === this.selectedService)
            .map((i) => this.instances = i.instances || null);
        this.getMetrics(this.selectedService);
    }

    public getMetrics(selectedService: string): void {
        this.updatingMetrics = true;
        this.metricsService
            .getMetricsByMsName(selectedService, 'metrics')
            .pipe(take(1), finalize(() => this.updatingMetrics = false))
            .subscribe((result) => {
                this.allMetrics = result || [];
                this.mapMetrics(this.allMetrics[0].instanceId);
            }, (error) => {
                console.log(error);
                this.noData = true;
            });
    }

    public mapMetrics(metricId): void {
        this.metrics = {};
        this.selectedInstance = metricId || '';
        const currentMetrics = this.allMetrics.filter((m) => m.instanceId === metricId).shift();
        this.metrics = this.validateMetric(currentMetrics) ? currentMetrics.metrics : {};
        this.noData = this.metricsService.isEmpty(this.metrics);
        this.servicesStats = {};
        this.cachesStats = {};
        if (this.metrics && this.metrics.timers) {
            Object.keys(this.metrics.timers).forEach((key) => {
                const value = this.metrics.timers[key];
                if (key.indexOf('web.rest') !== -1 || key.indexOf('service') !== -1) {
                    this.servicesStats[key] = value;
                }
            });
        }
        if (this.metrics && this.metrics.gauges) {
            Object.keys(this.metrics.gauges).forEach((key) => {
                if (key.indexOf('jcache.statistics') !== -1) {
                    const value = this.metrics.gauges[key].value;
                    // remove gets or puts
                    const index = key.lastIndexOf('.');
                    const newKey = key.substr(0, index);
                    // Keep the name of the domain
                    this.cachesStats[newKey] = {
                        name: this.JCACHE_KEY.length,
                        value: value,
                    };
                }
            });
        }
    }

    public refreshThreadDumpData(): void {
        this.metricsService.threadDump().subscribe((data) => {
            const modalRef = this.modalService.open(JhiMetricsMonitoringModalComponent, {size: 'lg', backdrop: 'static'});
            modalRef.componentInstance.threadDump = data && data.threads || [];
            modalRef.result.then((result) => {
                // Left blank intentionally, nothing to do here
            }, (reason) => {
                // Left blank intentionally, nothing to do here
            });
        });
    }

    public validateMetric(metric: any): boolean {
        return metric && metric.metrics && !(metric.metrics.error);
    }
}
