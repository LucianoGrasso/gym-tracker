import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GithubCiStackProps extends StackProps {
  /**
   * Prefijo del claim `sub` del token OIDC de GitHub. El repo usa subjects inmutables
   * (`repo:owner@ownerId/repo@repoId`): sobreviven a renombres y un repo recreado con el mismo nombre no calza.
   * Se obtiene con `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`.
   */
  readonly githubSubjectPrefix: string;
  /** ARN de un proveedor OIDC de GitHub que ya exista en la cuenta (solo puede haber uno). */
  readonly oidcProviderArn?: string;
}

/** Rol que GitHub Actions asume con OIDC (sin access keys) para desplegar desde `main`. */
export class GithubCiStack extends Stack {
  constructor(scope: Construct, id: string, props: GithubCiStackProps) {
    super(scope, id, props);

    const providerArn =
      props.oidcProviderArn ??
      new iam.OidcProviderNative(this, 'GithubOidc', {
        url: 'https://token.actions.githubusercontent.com',
        clientIds: ['sts.amazonaws.com'],
      }).oidcProviderArn;

    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'gymtracker-github-deploy',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `${props.githubSubjectPrefix}:ref:refs/heads/main`,
        },
      }),
    });

    const { account, region } = this;
    // cdk deploy usa los roles del bootstrap; este rol solo puede asumirlos.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${account}:role/cdk-hnb659fds-*-${account}-${region}`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:${region}:${account}:parameter/gymtracker/prod/*`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [`arn:aws:lambda:${region}:${account}:function:gymtracker-artisan`],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
