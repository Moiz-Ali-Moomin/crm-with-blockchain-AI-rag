## Summary

<!-- What does this PR do? 2-3 bullet points. -->

-
-

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / code quality
- [ ] Performance improvement
- [ ] Documentation
- [ ] CI/CD / infrastructure
- [ ] Breaking change

## Related Issues

Closes #

## Testing

<!-- How did you test this? What scenarios did you cover? -->

- [ ] Unit tests added / updated
- [ ] Tested locally with Docker
- [ ] Seeded DB and verified end-to-end

## Checklist

- [ ] Code follows the project's style (no class-validator, use Zod; repository pattern; no direct Prisma calls in services)
- [ ] No `.env` secrets committed
- [ ] Prisma migration added if schema changed (`npx prisma migrate dev --name ...`)
- [ ] New BullMQ jobs registered in `jobs.module.ts`
- [ ] New modules imported into `app.module.ts`
- [ ] Swagger decorators added to new controller endpoints
- [ ] All CI checks pass
