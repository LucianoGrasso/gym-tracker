import { RemovalPolicy } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface FrontendProps {
  /** Salida de `ng build`. */
  readonly distPath: string;
  /** Dominio de la HTTP API (`<id>.execute-api.<región>.amazonaws.com`). */
  readonly apiDomain: string;
}

/** Archivos sin hash en el nombre: deben revalidarse siempre (si no, el SW no ve versiones nuevas). */
const APP_SHELL = [
  'index.html',
  'manifest.webmanifest',
  'ngsw.json',
  'ngsw-worker.js',
  'safety-worker.js',
  'worker-basic.min.js',
];

/** CloudFront delante de S3 (la SPA) y de la API: mismo origen, así Sanctum funciona con cookies. */
export class Frontend extends Construct {
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendProps) {
    super(scope, id);

    const bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Rutas de Angular (/hoy, /rutinas/3…) → index.html. Solo en S3: los 404 de la API llegan intactos.
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event) { var r = event.request; if (r.uri.indexOf('.') === -1) { r.uri = '/index.html'; } return r; }",
      ),
    });

    const api: cloudfront.BehaviorOptions = {
      origin: new origins.HttpOrigin(props.apiDomain, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY }),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    };

    this.distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: 'GymTracker',
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: { '/api/*': api, '/auth/*': api, '/sanctum/*': api, '/push/*': api },
    });

    // Primero los assets con hash (inmutables; los íconos también: si cambian, se renombran),
    // después el shell que los referencia.
    const assets = new s3deploy.BucketDeployment(this, 'Assets', {
      sources: [s3deploy.Source.asset(props.distPath, { exclude: APP_SHELL })],
      destinationBucket: bucket,
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
    });
    const shell = new s3deploy.BucketDeployment(this, 'Shell', {
      sources: [s3deploy.Source.asset(props.distPath, { exclude: ['*', ...APP_SHELL.map((f) => `!${f}`)] })],
      destinationBucket: bucket,
      prune: false,
      cacheControl: [s3deploy.CacheControl.noCache()],
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
    shell.node.addDependency(assets);
  }
}
